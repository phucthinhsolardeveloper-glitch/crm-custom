import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PaymentMatchingService, ORDER_MATCHABLE_FILTER } from '../payments/payment-matching.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const BANK_TX_SELECT = {
  id: true, externalId: true, amount: true, content: true,
  bankAccount: true, senderName: true, senderAccount: true,
  transactionTime: true, matchedPaymentId: true, matchStatus: true,
  createdAt: true,
  matchedPayment: { select: { id: true, orderId: true, amount: true, status: true } },
} satisfies Prisma.BankTransactionSelect;

@Injectable()
export class BankTransactionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matchingService: PaymentMatchingService,
  ) {}

  async list(query: PaginationQueryDto & { matchStatus?: string }) {
    const limit = query.limit ?? 20;
    const where: Prisma.BankTransactionWhereInput = {};
    if (query.matchStatus) where.matchStatus = query.matchStatus as any;

    const txs = await this.prisma.bankTransaction.findMany({
      where, select: BANK_TX_SELECT, orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = txs.length > limit;
    const data = hasMore ? txs.slice(0, limit) : txs;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async listUnmatched(limit = 20, cursor?: string) {
    return this.list({ limit, cursor, matchStatus: 'UNMATCHED' });
  }

  /**
   * Bulk mark bank tx as IGNORED (soft cleanup). Chi anh huong UNMATCHED.
   * Da IGNORED hoac da match thi skip.
   */
  async bulkMarkIgnored(ids: bigint[]) {
    const result = await this.prisma.bankTransaction.updateMany({
      where: { id: { in: ids }, matchStatus: 'UNMATCHED' },
      data: { matchStatus: 'IGNORED' },
    });
    return { marked: result.count, skipped: ids.length - result.count };
  }

  /**
   * Bulk hard delete bank tx. Chi cho phep xoa UNMATCHED hoac IGNORED.
   * Khong xoa cai da MATCHED de tranh mat trace payment.
   */
  async bulkDelete(ids: bigint[]) {
    const result = await this.prisma.bankTransaction.deleteMany({
      where: { id: { in: ids }, matchStatus: { in: ['UNMATCHED', 'IGNORED'] } },
    });
    return { deleted: result.count, skipped: ids.length - result.count };
  }

  /** Restore IGNORED -> UNMATCHED de match lai. */
  async bulkRestore(ids: bigint[]) {
    const result = await this.prisma.bankTransaction.updateMany({
      where: { id: { in: ids }, matchStatus: 'IGNORED' },
      data: { matchStatus: 'UNMATCHED' },
    });
    return { restored: result.count, skipped: ids.length - result.count };
  }

  /** Ingest bank transaction from webhook OR CSV import. Dedup by externalId. */
  async ingest(data: {
    externalId: string; amount: number; content: string;
    bankAccount?: string; senderName?: string; senderAccount?: string;
    transactionTime?: string; rawData?: Record<string, unknown>;
  }) {
    if (!data.externalId) {
      throw new BadRequestException('externalId là bắt buộc');
    }
    if (typeof data.externalId !== 'string' || data.externalId.length > 255 || !/^[\w\-.]+$/.test(data.externalId)) {
      throw new BadRequestException('externalId không hợp lệ (chỉ chấp nhận chữ, số, dấu gạch, tối đa 255 ký tự)');
    }
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('Số tiền giao dịch phải lớn hơn 0');
    }

    // Dedup check 1: trùng Số giao dịch (external_id)
    const existing = await this.prisma.bankTransaction.findUnique({
      where: { externalId: data.externalId },
    });
    if (existing) throw new ConflictException('Giao dịch đã tồn tại (trùng external_id)');

    // Dedup check 2: trùng số tiền + nội dung + thời gian. Bắt trường hợp file
    // xuất lại gán Số giao dịch khác cho cùng một giao dịch thật, khiến chống
    // trùng theo external_id không phát hiện được.
    const txTime = data.transactionTime ? new Date(data.transactionTime) : new Date();
    const dupByContent = await this.prisma.bankTransaction.findFirst({
      where: {
        amount: data.amount,
        content: data.content,
        transactionTime: txTime,
      },
      select: { id: true },
    });
    if (dupByContent) {
      throw new ConflictException('Giao dịch đã tồn tại (trùng số tiền + nội dung + thời gian)');
    }

    const bankTx = await this.prisma.bankTransaction.create({
      data: {
        externalId: data.externalId,
        amount: data.amount,
        content: data.content,
        bankAccount: data.bankAccount,
        senderName: data.senderName,
        senderAccount: data.senderAccount,
        transactionTime: txTime,
        rawData: data.rawData as any ?? undefined,
      },
      select: BANK_TX_SELECT,
    });

    // Try auto-match with pending payments
    await this.matchingService.tryMatchBankTransaction(bankTx.id);

    return this.prisma.bankTransaction.findUnique({
      where: { id: bankTx.id }, select: BANK_TX_SELECT,
    });
  }

  /** Manual match: link bank transaction to payment. */
  async manualMatch(bankTxId: bigint, paymentId: bigint, userId: bigint) {
    const bankTx = await this.prisma.bankTransaction.findFirst({
      where: { id: bankTxId, matchStatus: 'UNMATCHED' },
    });
    if (!bankTx) throw new NotFoundException('Giao dịch không tìm thấy hoặc đã được ghép');

    // Order filter: khong cho match payment cua don huy/hoan tien/xoa mem (chan hoi sinh don)
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, status: 'PENDING', order: ORDER_MATCHABLE_FILTER },
    });
    if (!payment) {
      throw new NotFoundException(
        'Thanh toán không tìm thấy, không ở trạng thái PENDING, hoặc đơn hàng đã huỷ/hoàn tiền/xoá',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Guard predicate race-safe: cancel dong thoi cascade payment sang REJECTED
      // giua luc doc (findFirst tren) va ghi -> count=0, khong verify don da huy.
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING', order: ORDER_MATCHABLE_FILTER },
        data: {
          status: 'VERIFIED', verifiedBy: userId, verifiedAt: new Date(),
          verifiedSource: 'MANUAL',
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Thanh toán đã bị xử lý bởi thao tác khác hoặc đơn hàng vừa bị huỷ');
      }

      // FK matched_payment_id nam ben bank_transactions - set tai day
      await tx.bankTransaction.update({
        where: { id: bankTxId },
        data: { matchedPaymentId: paymentId, matchStatus: 'MANUALLY_MATCHED' },
      });

      await this.matchingService.checkConversionTrigger(tx, paymentId);

      return { bankTxId, paymentId, status: 'MANUALLY_MATCHED' };
    });
  }

  /**
   * Huy ghep (unmatch): thao link giao dich bank <-> payment da ghep nham.
   * Bank tx MATCHED/MANUALLY_MATCHED -> UNMATCHED + clear matchedPaymentId.
   * Payment ghep kem -> ve PENDING (clear verify fields) de doi soat/ghep lai.
   * KHONG revert order COMPLETED / lead CONVERTED (giong pattern xoa payment).
   * Chi SUPER_ADMIN (guard o controller).
   */
  async unmatch(bankTxId: bigint, userId: bigint) {
    const bankTx = await this.prisma.bankTransaction.findFirst({
      where: { id: bankTxId, matchStatus: { in: ['AUTO_MATCHED', 'MANUALLY_MATCHED', 'FUZZY_MATCHED'] } },
      select: { id: true, matchedPaymentId: true, amount: true },
    });
    if (!bankTx) throw new NotFoundException('Giao dịch không tìm thấy hoặc chưa được ghép');

    return this.prisma.$transaction(async (tx) => {
      // Race-safe: chi thao khi van con MATCHED/MANUALLY_MATCHED.
      const claimed = await tx.bankTransaction.updateMany({
        where: { id: bankTxId, matchStatus: { in: ['AUTO_MATCHED', 'MANUALLY_MATCHED', 'FUZZY_MATCHED'] } },
        data: { matchStatus: 'UNMATCHED', matchedPaymentId: null },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Giao dịch vừa bị xử lý bởi thao tác khác');
      }

      // Payment ghep kem -> ve PENDING de doi soat lai (neu con VERIFIED).
      if (bankTx.matchedPaymentId) {
        const payment = await tx.payment.findUnique({
          where: { id: bankTx.matchedPaymentId },
          select: { id: true, amount: true, status: true, order: { select: { leadId: true } } },
        });
        if (payment?.status === 'VERIFIED') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'PENDING', verifiedBy: null, verifiedAt: null, verifiedSource: null },
          });
          if (payment.order?.leadId) {
            await tx.activity.create({
              data: {
                entityType: 'LEAD', entityId: payment.order.leadId, userId, type: 'NOTE',
                content: `Huỷ ghép thanh toán ${Number(payment.amount).toLocaleString('vi-VN')}₫ - đưa về chờ xác minh`,
                metadata: { paymentId: payment.id.toString(), bankTxId: bankTxId.toString(), type: 'PAYMENT_UNMATCHED' },
              },
            });
          }
        }
      }

      return { bankTxId: bankTxId.toString(), paymentId: bankTx.matchedPaymentId?.toString() ?? null, status: 'UNMATCHED' };
    });
  }

  /**
   * Danh dau 1 giao dich bank la "tien du" (khong phai ban hang / Sale chua nhap).
   * Copy sang bang surplus_transactions rieng (tach CRM) + set bank tx -> IGNORED.
   * Dung IGNORED thay vi delete: recon tu an (loc IGNORED), giu external_id chong
   * import trung lai, giu trace. Chi ap cho bank tx con UNMATCHED.
   */
  async markSurplus(bankTxId: bigint, note: string | undefined, userId: bigint) {
    const bankTx = await this.prisma.bankTransaction.findFirst({
      where: { id: bankTxId, matchStatus: 'UNMATCHED' },
    });
    if (!bankTx) throw new NotFoundException('Giao dịch không tìm thấy hoặc đã được ghép/xử lý');

    return this.prisma.$transaction(async (tx) => {
      // Guard race: chi doi UNMATCHED -> IGNORED, count=0 neu bi xu ly song song.
      const claimed = await tx.bankTransaction.updateMany({
        where: { id: bankTxId, matchStatus: 'UNMATCHED' },
        data: { matchStatus: 'IGNORED' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Giao dịch vừa bị xử lý bởi thao tác khác');
      }

      const surplus = await tx.surplusTransaction.create({
        data: {
          externalId: bankTx.externalId,
          amount: bankTx.amount,
          content: bankTx.content,
          senderName: bankTx.senderName,
          senderAccount: bankTx.senderAccount,
          transactionTime: bankTx.transactionTime,
          note: note?.trim() || null,
          markedBy: userId,
        },
      });
      return { surplusId: surplus.id, bankTxId, status: 'SURPLUS' };
    });
  }

  /** List tien du (cursor pagination giong list()). */
  async listSurplus(limit = 20, cursor?: string) {
    const rows = await this.prisma.surplusTransaction.findMany({
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id.toString() : undefined } };
  }

  /**
   * Bo danh dau tien du (undo lo tay): xoa surplus row + tra bank tx IGNORED -> UNMATCHED
   * theo external_id (de recon thay lai + co the ghep). Neu bank tx da xoa thi chi xoa surplus.
   */
  async unmarkSurplus(surplusId: bigint) {
    const surplus = await this.prisma.surplusTransaction.findUnique({ where: { id: surplusId } });
    if (!surplus) throw new NotFoundException('Tiền dư không tìm thấy');

    return this.prisma.$transaction(async (tx) => {
      await tx.surplusTransaction.delete({ where: { id: surplusId } });
      await tx.bankTransaction.updateMany({
        where: { externalId: surplus.externalId, matchStatus: 'IGNORED' },
        data: { matchStatus: 'UNMATCHED' },
      });
      return { surplusId, status: 'UNMARKED' };
    });
  }
}
