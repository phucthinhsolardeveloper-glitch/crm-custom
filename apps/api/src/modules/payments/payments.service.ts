import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, Prisma, PaymentStatus, UserRole, EntityType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import { sanitizeCsvRow } from '@crm/utils';
import { PaymentMatchingService, ORDER_MATCHABLE_FILTER } from './payment-matching.service';
import { PaymentScoringService } from './payment-scoring.service';
import { CustomerTierRecalcService } from '../customer-tiers/customer-tier-recalc.service';
import { LarkSyncService } from '../lark-sync/lark-sync.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { parseVnDateTime } from '../../common/utils/vn-timezone';

/**
 * Build khoảng lọc ngày theo giờ Việt Nam (UTC+7). Hỗ trợ 2 format:
 * - YYYY-MM-DD (date-only): mở rộng dateTo đến 23:59:59.999 cuối ngày.
 * - YYYY-MM-DDTHH:mm (datetime-local): dùng đúng mốc giờ phút đã chọn.
 */
function buildVnDateRange(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter {
  const dateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const gte = dateFrom ? parseVnDateTime(dateFrom) : undefined;
  const lte = dateTo
    ? (dateOnly(dateTo) ? parseVnDateTime(`${dateTo}T23:59:59.999`) : parseVnDateTime(dateTo))
    : undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/** Query filter dùng chung cho list() và exportFiltered(). */
type PaymentListFilter = PaginationQueryDto & {
  status?: PaymentStatus[]; orderId?: string; paymentTypeId?: string[];
  productId?: string[]; productGroupId?: string[]; createdBy?: string[];
  teamId?: string[]; search?: string; dateFrom?: string; dateTo?: string;
};

interface CurrentUser {
  id: bigint;
  role: UserRole;
  departmentId: bigint | null;
  teamId?: bigint | null;
}

const PAYMENT_SELECT = {
  id: true, orderId: true, paymentTypeId: true, bankAccountId: true, amount: true,
  status: true, transferContent: true, verifiedSource: true, createdBy: true,
  verifiedBy: true, verifiedAt: true, createdAt: true, updatedAt: true,
  vatAmount: true, transferDate: true, installmentId: true,
  notes: true, completionRate: true, statusReason: true,
  paymentType: { select: { id: true, name: true } },
  bankAccount: { select: { id: true, name: true } },
  verifier: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
  matchedTransaction: { select: { id: true, externalId: true, amount: true, content: true, senderName: true, transactionTime: true } },
  installment: { select: { id: true, name: true } },
  order: {
    select: {
      id: true, status: true, amount: true, vatRate: true, totalAmount: true, vatEmail: true,
      companyName: true, taxCode: true, contactPerson: true, address: true,
      customerName: true, customerPhone: true,
      format: true, stt: true, courseCode: true, notes: true,
      customer: { select: { id: true, name: true, phone: true } },
      product: { select: { id: true, name: true, price: true } },
      productGroup: { select: { id: true, name: true } },
      orderFormat: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
      lead: { select: { id: true, name: true, source: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.PaymentSelect;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matchingService: PaymentMatchingService,
    private readonly scoringService: PaymentScoringService,
    private readonly tierRecalcService: CustomerTierRecalcService,
    private readonly larkSync: LarkSyncService,
    private readonly notifications: NotificationsService,
  ) {}

  private buildListWhere(query: PaymentListFilter, user?: CurrentUser): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};
    const orderWhere: Prisma.OrderWhereInput = {};

    // Multi-select: filter theo "nằm trong danh sách" (in) thay vì bằng 1 giá trị.
    const toIds = (v?: string[]) => (v?.length ? v.map((x) => BigInt(x)) : undefined);
    const productIds = toIds(query.productId);
    const productGroupIds = toIds(query.productGroupId);
    const createdByIds = toIds(query.createdBy);
    const teamIds = toIds(query.teamId);
    const paymentTypeIds = toIds(query.paymentTypeId);

    if (productIds) orderWhere.productId = { in: productIds };
    if (productGroupIds) orderWhere.productGroupId = { in: productGroupIds };
    if (createdByIds) orderWhere.createdBy = { in: createdByIds };
    // teamId loc qua relation order.creator.teamId (Order khong co teamId truc tiep)
    if (teamIds) orderWhere.creator = { teamId: { in: teamIds } };
    // IDOR + nghiep vu scope danh sach /orders (thuc chat list payment):
    // - USER: chi payment DO CHINH MINH tao (payment.created_by).
    // - LEADER co team: payment thuoc don do thanh vien cung team tao (giam sat thuan doc).
    // - LEADER khong team: self-scope nhu USER.
    // - MANAGER+: khong scope (thay tat ca).
    // Muon xem full payment cua 1 don -> mo trang chi tiet don /orders/:id.
    if (user && user.role === UserRole.LEADER && user.teamId != null) {
      orderWhere.creator = { teamId: user.teamId };
    } else if (user && (user.role === UserRole.USER || user.role === UserRole.LEADER)) {
      where.createdBy = user.id;
    }
    if (Object.keys(orderWhere).length) where.order = orderWhere;

    if (query.status?.length) where.status = { in: query.status };
    if (query.orderId) where.orderId = BigInt(query.orderId);
    if (paymentTypeIds) where.paymentTypeId = { in: paymentTypeIds };
    if (query.dateFrom || query.dateTo) {
      // Lọc theo Ngày CK (transferDate - do sale điền), không phải ngày tạo đơn.
      // Payment chưa điền transferDate sẽ không lọt qua bộ lọc ngày.
      where.transferDate = buildVnDateRange(query.dateFrom, query.dateTo);
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { transferContent: { contains: term, mode: 'insensitive' } },
        { order: { customer: { name: { contains: term, mode: 'insensitive' } } } },
      ];
    }
    return where;
  }

  async list(query: PaymentListFilter, user?: CurrentUser) {
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(query, user);

    // Offset-based pagination when page is provided
    if (query.page) {
      const page = query.page;
      const skip = (page - 1) * limit;
      const [payments, total, totals] = await Promise.all([
        this.prisma.payment.findMany({ where, select: PAYMENT_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: limit }),
        this.prisma.payment.count({ where }),
        this.computeMoneyTotals(where),
      ]);
      return { data: payments, meta: { total, page, limit, totalPages: Math.ceil(total / limit), totals } };
    }

    // Cursor-based pagination (default)
    const payments = await this.prisma.payment.findMany({
      where, select: PAYMENT_SELECT, orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = payments.length > limit;
    const data = hasMore ? payments.slice(0, limit) : payments;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  /**
   * Tong tien toan bo tap dang loc (khong chi trang hien tai) cho dong tong o cuoi bang /orders.
   * amount cong thang; VAT/DT thuan phu thuoc vat_rate tung don nen tach phan VAT nam trong so CK
   * (amount da gom VAT) - cung cong thuc voi cell renderer o FE. Nap gon amount + vat_rate.
   */
  private async computeMoneyTotals(where: Prisma.PaymentWhereInput) {
    const rows = await this.prisma.payment.findMany({
      where,
      select: { amount: true, order: { select: { vatRate: true } } },
    });
    let amount = 0, vatAmount = 0, netRevenue = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      const rate = r.order?.vatRate != null ? Number(r.order.vatRate) : 0;
      const vat = Math.round(amt * rate / (100 + rate));
      amount += amt;
      vatAmount += vat;
      netRevenue += amt - vat;
    }
    return { amount, vatAmount, netRevenue };
  }

  async findById(id: bigint, user?: CurrentUser) {
    const where: Prisma.PaymentWhereInput = { id };
    // IDOR: USER/LEADER doc payment neu DO CHINH MINH tao (payment.created_by) HOAC payment thuoc
    // don minh dang cham soc (tao don / giu lead / giu khach). Dam bao luon doc duoc payment
    // cua chinh minh de sua/huy, ke ca khi lead da bi chuyen di. MANAGER+ khong scope (thay tat ca).
    if (user && user.role === UserRole.LEADER && user.teamId != null) {
      // LEADER co team: doc payment thuoc don do thanh vien cung team tao (nhat quan voi list).
      where.OR = [
        { createdBy: user.id },
        { order: { creator: { teamId: user.teamId } } },
      ];
    } else if (user && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.MANAGER) {
      where.OR = [
        { createdBy: user.id },
        { order: { createdBy: user.id } },
        { order: { lead: { assignedUserId: user.id } } },
        { order: { customer: { assignedUserId: user.id } } },
      ];
    }
    const payment = await this.prisma.payment.findFirst({
      where, select: PAYMENT_SELECT,
    });
    if (!payment) throw new NotFoundException('Không tìm thấy thanh toán');
    return payment;
  }

  /** Score window: bank tx khop neu amount cach payment <= 5k VND. */
  private static readonly MATCH_AMOUNT_RANGE = 5000;

  async listPending(limit = 20, cursor?: string) {
    const result = await this.list({ limit, cursor, status: ['PENDING'] });
    if (result.data.length === 0) return result;

    // Enrich moi payment voi bestMatchScore + candidateCount cho badge UI.
    // Gop 1 query: nap het bank tx UNMATCHED trong dai bao phu mọi payment cua trang,
    // roi score in-memory. Truoc day moi payment 1 findMany rieng -> N+1 (N query/page).
    const range = PaymentsService.MATCH_AMOUNT_RANGE;
    const amounts = result.data.map((p) => Number(p.amount));
    const candidates = await this.prisma.bankTransaction.findMany({
      where: {
        matchStatus: 'UNMATCHED',
        amount: { gte: Math.min(...amounts) - range, lte: Math.max(...amounts) + range },
      },
      orderBy: { transactionTime: 'desc' },
      take: 500,
    });

    const enriched = result.data.map((p) => {
      const amountNum = Number(p.amount);
      let bestScore: number | null = null;
      let candidateCount = 0;
      for (const tx of candidates) {
        const txAmount = Number(tx.amount);
        if (txAmount < amountNum - range || txAmount > amountNum + range) continue;
        const r = this.scoringService.scorePair(p, tx);
        if (r && r.score >= 30) {
          candidateCount++;
          if (bestScore == null || r.score > bestScore) bestScore = r.score;
        }
      }
      return { ...p, bestMatchScore: bestScore, candidateCount };
    });
    return { ...result, data: enriched };
  }

  /**
   * Core tạo payment bên trong transaction đang mở. Dùng chung cho POST /payments
   * và luồng tạo đơn + thanh toán atomic (OrdersService.create): payment fail ->
   * caller rollback được cả transaction. Sau khi commit, caller PHẢI gọi
   * runPaymentPostCreate() để chạy side effects (match bank, activity, Lark sync).
   */
  async createPaymentInTx(tx: Prisma.TransactionClient, data: {
    orderId: string; amount: number; paymentTypeId?: string; bankAccountId?: string; transferContent?: string;
    transferDate?: Date; installmentId?: bigint; notes?: string; larkSyncId?: string;
  }, user?: CurrentUser) {
    // Defense-in-depth: DTO đã validate, chặn lần 2 cho caller nội bộ (import, webhook)
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new ConflictException('Số tiền thanh toán phải lớn hơn 0');
    }

    const orderId = BigInt(data.orderId);

    // Row lock trên order: 2 request đồng thời cùng order phải tuần tự
    // qua aggregate -> create, không thì cả 2 cùng đọc currentTotal cũ và vượt totalAmount.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      // Lấy kèm người đang giữ lead/khách để check quyền theo assignment, không chỉ theo người tạo đơn
      include: {
        customer: { select: { assignedUserId: true } },
        lead: { select: { assignedUserId: true } },
      },
    });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    // USER được tạo payment nếu tự tạo đơn HOẶC đang được giao lead/khách của đơn này.
    // Đơn có thể do người khác bấm tạo, nhưng lead/khách vẫn thuộc quyền chăm sóc của sale hiện tại.
    if (user && user.role === UserRole.USER) {
      const uid = user.id.toString();
      const isCreator = order.createdBy.toString() === uid;
      const isCustomerOwner = order.customer?.assignedUserId?.toString() === uid;
      const isLeadOwner = order.lead?.assignedUserId?.toString() === uid;
      if (!isCreator && !isCustomerOwner && !isLeadOwner) {
        throw new ForbiddenException('Bạn chỉ có thể tạo thanh toán cho đơn hàng của khách/lead mình đang phụ trách');
      }
    }

    // Validate total payments don't exceed order amount.
    // Đếm tiền thật + đang chờ (PENDING, VERIFIED, REJECTED). Loại REFUNDED + CANCELLED
    // vì tiền đã trả lại / không về -> giải phóng chỗ để tạo payment mới.
    const existing = await tx.payment.aggregate({
      where: { orderId, status: { notIn: ['REFUNDED', 'CANCELLED'] } },
      _sum: { amount: true },
    });
    const currentTotal = Number(existing._sum.amount || 0);
    const orderTotal = Number(order.totalAmount);
    // Cho phép thu vượt tối đa 250% giá đơn (bù phí CK / làm tròn / mua thêm).
    const maxAllowed = orderTotal * 2.5;

    if (currentTotal >= maxAllowed) {
      throw new ConflictException('Don hang da thu du (toi da 250%), khong the them thanh toan');
    }
    if (currentTotal + data.amount > maxAllowed) {
      throw new ConflictException('Tong thanh toan vuot qua 250% gia tri don hang');
    }

    // Snapshot tỉ lệ TT lúc tạo (cộng dồn gồm cả payment này). Mẫu số = tổng tiền đơn
    // (đơn giá * số lượng, đã gồm VAT). Khách trả đủ tổng -> tỉ lệ đúng 100%.
    const completionRate = orderTotal > 0
      ? Math.round(((currentTotal + data.amount) / orderTotal) * 10000) / 100
      : 0;

    // VAT fix cứng theo vatRate của đơn (đi theo sản phẩm) - KHÔNG tin giá trị client gửi.
    // Số CK đã bao gồm VAT -> tách phần VAT nằm trong số tiền. Đơn không VAT -> null.
    const orderVatRate = Number(order.vatRate) || 0;
    const vatAmount = orderVatRate > 0
      ? Math.round(data.amount * orderVatRate / (100 + orderVatRate))
      : undefined;

    const payment = await tx.payment.create({
      data: {
        order: { connect: { id: orderId } },
        amount: data.amount,
        transferContent: data.transferContent,
        notes: data.notes,
        completionRate,
        // Nguoi bam tao payment - dung de USER tu sua/huy payment PENDING cua chinh minh.
        // Import/webhook goi khong kem user -> NULL (khong ai "so huu" de tu sua).
        ...(user ? { creator: { connect: { id: user.id } } } : {}),
        ...(data.transferDate ? { transferDate: data.transferDate } : {}),
        ...(vatAmount !== undefined ? { vatAmount } : {}),
        ...(data.paymentTypeId ? { paymentType: { connect: { id: BigInt(data.paymentTypeId) } } } : {}),
        ...(data.bankAccountId ? { bankAccount: { connect: { id: BigInt(data.bankAccountId) } } } : {}),
        ...(data.installmentId ? { installment: { connect: { id: data.installmentId } } } : {}),
        // Bang Lark rieng cho payment; khong chon -> null -> fallback bang cua don luc sync.
        ...(data.larkSyncId ? { larkSyncMapping: { connect: { id: BigInt(data.larkSyncId) } } } : {}),
      },
      select: PAYMENT_SELECT,
    });

    return { payment, order };
  }

  /**
   * Side effects sau khi transaction chứa payment đã commit
   * (tryMatchPayment mở transaction riêng - không được lồng vào tx đang mở).
   */
  async runPaymentPostCreate(
    payment: { id: bigint },
    order: { leadId: bigint | null; createdBy: bigint },
    data: { amount: number; transferContent?: string },
  ): Promise<void> {
    // Auto-match ngay khi tạo payment đã TẮT theo yêu cầu: payment giữ PENDING
    // chờ duyệt tay (hoặc webhook bank / cron fuzzy khớp sau), không tự VERIFIED.

    // Log activity on lead timeline
    if (order.leadId) {
      await this.prisma.activity.create({
        data: {
          entityType: 'LEAD', entityId: order.leadId, userId: order.createdBy,
          type: 'NOTE',
          content: `Thanh toán ${data.amount.toLocaleString('vi-VN')}₫ - ${data.transferContent || 'CK'} (chờ xác nhận)`,
          metadata: { paymentId: payment.id.toString(), type: 'PAYMENT_CREATED' },
        },
      });
    }

    // Day payment sang Lark Base chay nen (best-effort, khong chan tao payment)
    void this.larkSync.enqueuePaymentSync(payment.id.toString(), 'create');
  }

  async create(data: {
    orderId: string; amount: number; paymentTypeId?: string; bankAccountId?: string; transferContent?: string;
    transferDate?: Date; installmentId?: bigint; notes?: string; larkSyncId?: string;
  }, user?: CurrentUser) {
    // Guard tiền TRƯỚC khi mở transaction - amount rác không được chạm DB.
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new ConflictException('Số tiền thanh toán phải lớn hơn 0');
    }
    const { payment, order } = await this.prisma.$transaction(async (tx) =>
      this.createPaymentInTx(tx, data, user),
    );
    await this.runPaymentPostCreate(payment, order, data);
    return this.findById(payment.id);
  }

  async verifyManual(id: bigint, userId: bigint, bankTransactionId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id, status: 'PENDING' },
        include: { order: { select: { deletedAt: true } } },
      });
      if (!payment) throw new ConflictException('Thanh toán không ở trạng thái PENDING');

      // Đơn đã xoá mềm: verify sẽ hồi sinh + tính lại tiền vào doanh thu.
      // Việc chặn hồi sinh payment đã REFUNDED/CANCELLED do guard status:'PENDING' ở trên lo.
      if (!payment.order || payment.order.deletedAt !== null) {
        throw new ConflictException('Đơn hàng đã xoá - không thể xác nhận thanh toán');
      }

      const updateData: any = {
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
        verifiedSource: 'MANUAL',
      };

      if (bankTransactionId) {
        const bankTxId = BigInt(bankTransactionId);

        // Atomic claim - chỉ update nếu bankTx CHƯA matched (race-safe).
        // Pattern updateMany với guard predicate đảm bảo 2 concurrent verify cùng bankTxId
        // chỉ 1 thành công, cái còn lại claim.count === 0 → throw 409.
        const claim = await tx.bankTransaction.updateMany({
          where: {
            id: bankTxId,
            matchStatus: 'UNMATCHED',
          },
          data: {
            matchedPaymentId: id,
            matchStatus: 'MANUALLY_MATCHED',
          },
        });

        if (claim.count === 0) {
          throw new ConflictException(
            'Bank transaction không UNMATCHED - có thể đã được ghép payment khác hoặc không tồn tại',
          );
        }

        // Validate amount khớp - throw để $transaction rollback claim
        const bankTx = await tx.bankTransaction.findUniqueOrThrow({ where: { id: bankTxId } });
        if (bankTx.amount.toString() !== payment.amount.toString()) {
          throw new ConflictException(
            `Số tiền không khớp: bank transaction ${bankTx.amount} vs payment ${payment.amount}`,
          );
        }

        // FK matched_payment_id nam ben bank_transactions - claim updateMany o tren
        // da set roi, khong can connect tu phia payment.
      }

      // Guard predicate race-safe: cancel dong thoi cascade payment sang REJECTED
      // giua luc doc va ghi -> count=0, khong lat lai VERIFIED tren don da huy.
      const claimed = await tx.payment.updateMany({
        where: { id, status: 'PENDING', order: ORDER_MATCHABLE_FILTER },
        data: updateData,
      });
      if (claimed.count === 0) {
        throw new ConflictException('Thanh toán đã bị xử lý bởi thao tác khác hoặc đơn hàng vừa bị huỷ');
      }

      // Check conversion trigger
      await this.matchingService.checkConversionTrigger(tx, id);

      // Recalc tier khách hàng sau verify (denormalized totalSpent + currentTierId)
      const order = await tx.order.findFirst({
        where: { id: payment.orderId },
        select: { leadId: true, customerId: true },
      });
      if (order?.customerId) {
        await this.tierRecalcService.recalcForCustomer(order.customerId, tx);
      }

      // Log verified activity on lead
      if (order?.leadId) {
        await tx.activity.create({
          data: {
            entityType: 'LEAD', entityId: order.leadId, userId,
            type: 'NOTE',
            content: `Xác nhận thanh toán ${Number(payment.amount).toLocaleString('vi-VN')}₫ ✅`,
            metadata: { paymentId: id.toString(), type: 'PAYMENT_VERIFIED' },
          },
        });
      }
    });

    // Doi status -> cap nhat lai dong tren Lark (best-effort).
    void this.larkSync.enqueuePaymentSync(id.toString(), 'verify');

    // Read after transaction commits to return up-to-date status
    return this.findById(id);
  }

  /**
   * Reject: PENDING -> REJECTED. Nghĩa MỚI = tiền CÓ về nhưng sale nhập sai (phạt sale).
   * Tính vào ví công ty (doanh thu tổng + tier), KHÔNG tính doanh số sale. SUPER_ADMIN only.
   */
  async reject(id: bigint, userId: bigint, reason?: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id, status: 'PENDING' },
        include: { order: { select: { id: true, leadId: true, customerId: true, createdBy: true } } },
      });
      if (!payment) throw new ConflictException('Thanh toán không ở trạng thái PENDING');

      const claimed = await tx.payment.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED', statusReason: reason?.trim() || null,
          verifiedBy: userId, verifiedAt: new Date(), verifiedSource: 'MANUAL',
        },
      });
      if (claimed.count === 0) throw new ConflictException('Thanh toán đã bị xử lý bởi thao tác khác');

      // REJECTED = tiền có về -> tính ví công ty -> tier có thể tăng.
      if (payment.order?.customerId) {
        await this.tierRecalcService.recalcForCustomer(payment.order.customerId, tx);
      }
      await this.logPaymentStatusActivity(tx, payment.order, payment.amount, userId, 'REJECTED', reason);
      return payment.order;
    });

    if (order) await this.notifyOrderCreator(order, 'REJECTED', reason);

    // Doi status -> cap nhat lai dong tren Lark (best-effort).
    void this.larkSync.enqueuePaymentSync(id.toString(), 'reject');
    return this.findById(id);
  }

  /**
   * Cancel: huỷ payment PENDING = xoá thẳng bản ghi (không giữ trạng thái CANCELLED).
   * PENDING chưa tính vào ví nào và chưa match bank transaction nên xoá an toàn,
   * không revert order/lead. Audit trail vẫn ghi trên lead qua deleteById.
   * Quyền: SUPER_ADMIN, hoặc chính người đã tạo payment tự huỷ khi CÒN PENDING.
   */
  async cancel(id: bigint, user: CurrentUser) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, status: 'PENDING' },
      include: { order: { select: { createdBy: true } } },
    });
    if (!payment) throw new ConflictException('Thanh toán không ở trạng thái PENDING');

    // SUPER_ADMIN huỷ bất kỳ; người khác chỉ huỷ payment DO CHÍNH MÌNH tạo (khi còn PENDING).
    // payment.createdBy NULL = payment cũ / import / webhook -> fallback về người tạo đơn
    // để giữ tương thích ngược (payment cũ chưa có cột này).
    const ownerId = payment.createdBy ?? payment.order?.createdBy;
    const isOwner = ownerId?.toString() === user.id.toString();
    if (user.role !== UserRole.SUPER_ADMIN && !isOwner) {
      throw new ForbiddenException('Bạn chỉ có thể huỷ thanh toán do chính mình tạo');
    }

    return this.deleteById(id, user.id);
  }

  /**
   * Refund: VERIFIED -> REFUNDED. Tiền đã về rồi trả lại khách - rút khỏi ví công ty.
   * SUPER_ADMIN only. Tier recalc vì tiền VERIFIED bị rút ra.
   */
  async refund(id: bigint, userId: bigint, reason?: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id, status: 'VERIFIED' },
        include: { order: { select: { id: true, leadId: true, customerId: true, createdBy: true } } },
      });
      if (!payment) throw new ConflictException('Chỉ có thể hoàn tiền thanh toán đã xác nhận (VERIFIED)');

      const claimed = await tx.payment.updateMany({
        where: { id, status: 'VERIFIED' },
        data: { status: 'REFUNDED', statusReason: reason?.trim() || null },
      });
      if (claimed.count === 0) throw new ConflictException('Thanh toán đã bị xử lý bởi thao tác khác');

      // Rút tiền VERIFIED khỏi ví công ty -> tier có thể giảm.
      if (payment.order?.customerId) {
        await this.tierRecalcService.recalcForCustomer(payment.order.customerId, tx);
      }
      await this.logPaymentStatusActivity(tx, payment.order, payment.amount, userId, 'REFUNDED', reason);
      return payment.order;
    });

    // Doi status -> cap nhat lai dong tren Lark (best-effort).
    void this.larkSync.enqueuePaymentSync(id.toString(), 'refund');
    return this.findById(id);
  }

  /** Bắn thông báo cho người tạo đơn khi payment bị REJECTED/CANCELLED (kèm lý do nếu có). */
  private async notifyOrderCreator(
    order: { id: bigint; createdBy: bigint },
    action: 'REJECTED' | 'CANCELLED',
    reason?: string,
  ) {
    const title = action === 'REJECTED' ? 'Thanh toán bị đánh dấu sai thông tin' : 'Thanh toán bị huỷ';
    let content =
      action === 'REJECTED'
        ? `Đơn #${order.id}: một thanh toán bị đánh dấu sai thông tin`
        : `Đơn #${order.id}: một thanh toán đã bị huỷ`;
    if (reason?.trim()) content += `. Lý do: ${reason.trim()}`;
    await this.notifications.create(
      order.createdBy, title, content,
      action === 'REJECTED' ? 'PAYMENT_REJECTED' : 'PAYMENT_CANCELLED',
      EntityType.ORDER, order.id,
    );
  }

  /** Ghi activity timeline lead khi payment đổi trạng thái reject/cancel/refund. */
  private async logPaymentStatusActivity(
    tx: Prisma.TransactionClient,
    order: { leadId: bigint | null } | null,
    amount: Prisma.Decimal,
    userId: bigint,
    action: 'REJECTED' | 'CANCELLED' | 'REFUNDED',
    reason?: string,
  ) {
    if (!order?.leadId) return;
    const verb =
      action === 'REJECTED' ? 'Đánh dấu sai thông tin' : action === 'CANCELLED' ? 'Huỷ' : 'Hoàn tiền';
    let content = `${verb} thanh toán ${Number(amount).toLocaleString('vi-VN')}₫`;
    if (reason?.trim()) content += ` - ${reason.trim()}`;
    await tx.activity.create({
      data: {
        entityType: 'LEAD', entityId: order.leadId, userId,
        type: 'NOTE',
        content,
        metadata: { type: `PAYMENT_${action}`, reason: reason?.trim() || null },
      },
    });
  }

  /**
   * Bulk hard delete payments - SUPER_ADMIN only. Trả về { deleted, skipped }.
   * Side-effect mỗi payment: revert bank tx match nếu VERIFIED, activity log trên lead.
   * Mỗi payment xử lý trong 1 transaction riêng - 1 lỗi không rollback các payment khác.
   * Max 500 IDs/lần (cap ở controller).
   */
  async bulkDelete(ids: bigint[], userId: bigint): Promise<{ deleted: number; skipped: number }> {
    let deleted = 0;
    let skipped = 0;
    for (const id of ids) {
      try {
        await this.deleteById(id, userId);
        deleted++;
      } catch {
        // NotFoundException hoặc DB error -> skip, tiếp tục batch
        skipped++;
      }
    }
    return { deleted, skipped };
  }

  /**
   * Hard delete payment - chỉ SUPER_ADMIN gọi được (guard ở controller).
   * Side effects:
   * - Nếu payment VERIFIED + có matched bank transaction: revert bank tx về UNMATCHED, clear matchedPaymentId
   * - Lead status KHÔNG revert (theo CLAUDE.md: order cancel/refund/payment delete không revert CONVERTED)
   * - Activity log trên lead để audit trail
   */
  async deleteById(id: bigint, userId: bigint) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        matchedTransaction: { select: { id: true } },
        order: { select: { id: true, leadId: true, larkSyncId: true } },
      },
    });
    // larkSyncId la scalar cua payment, findUnique tra ve san (khong can include).
    if (!payment) throw new NotFoundException('Thanh toán không tồn tại');

    await this.prisma.$transaction(async (tx) => {
      // Revert matched bank transaction nếu có
      if (payment.matchedTransaction?.id) {
        await tx.bankTransaction.update({
          where: { id: payment.matchedTransaction.id },
          data: { matchStatus: 'UNMATCHED', matchedPaymentId: null },
        });
      }

      // Audit activity trên lead (giữ trace dù payment đã bị xoá)
      if (payment.order?.leadId) {
        await tx.activity.create({
          data: {
            entityType: 'LEAD',
            entityId: payment.order.leadId,
            userId,
            type: 'NOTE',
            content: `Xoá thanh toán ${Number(payment.amount).toLocaleString('vi-VN')}₫ (status: ${payment.status})`,
            metadata: {
              paymentId: id.toString(),
              orderId: payment.orderId.toString(),
              type: 'PAYMENT_DELETED',
              originalAmount: payment.amount.toString(),
              originalStatus: payment.status,
            },
          },
        });
      }

      // Hard delete (model không có deletedAt - audit trail nằm ở activity log)
      await tx.payment.delete({ where: { id } });
    });

    // Payment da co dong tren Lark -> giu dong, doi status sang "da xoa" (best-effort).
    // Uu tien bang cua payment (neu chon rieng), khong thi fallback bang cua don.
    const deleteLarkSyncId = payment.larkSyncId ?? payment.order?.larkSyncId;
    if (payment.larkRecordId && deleteLarkSyncId) {
      void this.larkSync.enqueuePaymentDelete(
        payment.larkRecordId,
        deleteLarkSyncId.toString(),
      );
    }

    return { id: id.toString(), message: 'Đã xoá thanh toán' };
  }

  /**
   * Sửa field payment-level (bank, ngày CK, nội dung, hình thức, đợt, amount, VAT, notes).
   * KHÓA CHẶT field verify: status/verifiedBy/verifiedAt/verifiedSource/orderId không nhận qua DTO.
   * Quyền: MANAGER+ sửa mọi payment; USER/LEADER chỉ sửa payment DO CHÍNH MÌNH tạo và
   * CÒN PENDING (chưa xác minh). Enforce ở service, không ở @Roles controller.
   *
   * Sửa amount CHỈ cho phép khi payment còn PENDING (chưa tính vào ví nào). Payment đã
   * VERIFIED/REJECTED/REFUNDED chỉ sửa được metadata - đổi amount lúc đó sẽ phá doanh thu/tier
   * đã chốt. Khi sửa amount: re-validate tổng <= totalAmount + recompute completionRate,
   * dùng row-lock FOR UPDATE giống create() để 2 request đồng thời không vượt trần.
   */
  async update(
    id: bigint,
    dto: {
      bankAccountId?: string; transferDate?: string; transferContent?: string;
      paymentTypeId?: string; installmentId?: string; amount?: number;
      notes?: string;
    },
    user: CurrentUser,
  ) {
    const userId = user.id;
    // Validate FK tồn tại nếu client gửi (tránh Prisma P2025 khó hiểu).
    if (dto.bankAccountId) {
      const bank = await this.prisma.bankAccount.findUnique({ where: { id: BigInt(dto.bankAccountId) } });
      if (!bank) throw new NotFoundException('Ngân hàng không tồn tại');
    }
    if (dto.paymentTypeId) {
      const pt = await this.prisma.paymentType.findUnique({ where: { id: BigInt(dto.paymentTypeId) } });
      if (!pt) throw new NotFoundException('Hình thức CK không tồn tại');
    }
    if (dto.installmentId) {
      const inst = await this.prisma.paymentInstallment.findUnique({ where: { id: BigInt(dto.installmentId) } });
      if (!inst) throw new NotFoundException('Đợt thanh toán không tồn tại');
    }

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id },
        include: { order: { select: { id: true, amount: true, totalAmount: true, leadId: true, vatRate: true, createdBy: true } } },
      });
      if (!payment) throw new NotFoundException('Không tìm thấy thanh toán');
      if (!payment.order) throw new NotFoundException('Đơn hàng không tồn tại');

      // Quyền sửa: MANAGER+ mở; USER/LEADER chỉ sửa payment DO CHÍNH MÌNH tạo và CÒN PENDING.
      // createdBy NULL (payment cũ/import/webhook) -> fallback người tạo đơn để tương thích ngược.
      if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.MANAGER) {
        const ownerId = payment.createdBy ?? payment.order.createdBy;
        if (ownerId?.toString() !== userId.toString()) {
          throw new ForbiddenException('Bạn chỉ có thể sửa thanh toán do chính mình tạo');
        }
        if (payment.status !== 'PENDING') {
          throw new ConflictException('Chỉ sửa được thanh toán khi đang chờ xác nhận (PENDING)');
        }
      }

      const updateData: Prisma.PaymentUpdateInput = {};

      // Metadata sửa được ở mọi trạng thái.
      if (dto.transferContent !== undefined) updateData.transferContent = dto.transferContent;
      if (dto.notes !== undefined) updateData.notes = dto.notes;
      if (dto.transferDate !== undefined) updateData.transferDate = new Date(dto.transferDate);
      if (dto.bankAccountId !== undefined) {
        updateData.bankAccount = dto.bankAccountId
          ? { connect: { id: BigInt(dto.bankAccountId) } }
          : { disconnect: true };
      }
      if (dto.paymentTypeId !== undefined) {
        updateData.paymentType = dto.paymentTypeId
          ? { connect: { id: BigInt(dto.paymentTypeId) } }
          : { disconnect: true };
      }
      if (dto.installmentId !== undefined) {
        updateData.installment = dto.installmentId
          ? { connect: { id: BigInt(dto.installmentId) } }
          : { disconnect: true };
      }

      // Sửa amount: chỉ khi PENDING + re-validate trần + recompute completionRate.
      if (dto.amount !== undefined && dto.amount !== Number(payment.amount)) {
        if (payment.status !== 'PENDING') {
          throw new ConflictException('Chỉ sửa được số tiền khi thanh toán đang chờ xác nhận (PENDING)');
        }
        // Row-lock order để aggregate + update tuần tự (như create()).
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${payment.order.id} FOR UPDATE`;

        // Tổng các payment KHÁC (loại chính payment này) còn tính vào trần đơn.
        const others = await tx.payment.aggregate({
          where: { orderId: payment.order.id, id: { not: id }, status: { notIn: ['REFUNDED', 'CANCELLED'] } },
          _sum: { amount: true },
        });
        const othersTotal = Number(others._sum.amount || 0);
        const orderTotal = Number(payment.order.totalAmount);
        // Cùng trần 250% như create() để nhất quán 2 luồng tạo/sửa.
        if (othersTotal + dto.amount > orderTotal * 2.5) {
          throw new ConflictException('Tong thanh toan vuot qua 250% gia tri don hang');
        }

        const completionRate = orderTotal > 0
          ? Math.round(((othersTotal + dto.amount) / orderTotal) * 10000) / 100
          : 0;
        updateData.amount = dto.amount;
        updateData.completionRate = completionRate;

        // VAT fix cứng theo vatRate của đơn - tính lại từ amount mới, không nhận từ client.
        const orderVatRate = Number(payment.order.vatRate) || 0;
        updateData.vatAmount = orderVatRate > 0
          ? Math.round(dto.amount * orderVatRate / (100 + orderVatRate))
          : null;
      }

      await tx.payment.update({ where: { id }, data: updateData });

      // Audit trên lead (cùng pattern các action khác). Log số tiền mới nếu amount đổi.
      if (payment.order.leadId) {
        const shownAmount = updateData.amount !== undefined ? Number(updateData.amount) : Number(payment.amount);
        await tx.activity.create({
          data: {
            entityType: 'LEAD', entityId: payment.order.leadId, userId,
            type: 'NOTE',
            content: `Sửa thông tin thanh toán ${shownAmount.toLocaleString('vi-VN')}₫`,
            metadata: { paymentId: id.toString(), type: 'PAYMENT_UPDATED' },
          },
        });
      }
    });

    // Đổi thông tin -> cập nhật lại dòng trên Lark (best-effort).
    void this.larkSync.enqueuePaymentSync(id.toString(), 'update');

    return this.findById(id);
  }

  async exportVerified(dateFrom?: string, dateTo?: string, user?: CurrentUser): Promise<Buffer> {
    const where: Prisma.PaymentWhereInput = { status: 'VERIFIED' };
    if (dateFrom || dateTo) {
      // Xuất theo Ngày CK (transferDate) cho khớp bộ lọc danh sách.
      where.transferDate = buildVnDateRange(dateFrom, dateTo);
    }
    // IDOR: MANAGER only sees payments from own department's orders
    if (user && user.role !== UserRole.SUPER_ADMIN && user.departmentId) {
      where.order = { creator: { departmentId: user.departmentId } };
    }

    const payments = await this.prisma.payment.findMany({
      where,
      select: PAYMENT_SELECT,
      orderBy: { id: 'desc' },
      take: 10000, // bounded to prevent OOM on large datasets
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hoá đơn đã xác minh');

    const formatDate = (d: Date | string | null | undefined): string => {
      if (!d) return '';
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const headers = [
      '#', 'Số tiền', 'Tiền VAT', 'Loại CK', 'Lần CK', 'Nội dung CK', 'Ngày CK',
      'Khách hàng', 'SĐT', 'Sản phẩm', 'Tên công ty', 'MST', 'Người liên hệ',
      'Địa chỉ', 'Mail VAT', 'Hình thức', 'Nhóm SP', 'STT', 'Mã khoá',
      'Ghi chú', 'Nguồn xác minh', 'Người xác nhận', 'Ngày xác nhận',
    ];

    sheet.addRow(headers);

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Data rows
    payments.forEach((p, idx) => {
      const o = p.order;
      sheet.addRow([
        idx + 1,
        Number(p.amount),
        p.vatAmount != null ? Number(p.vatAmount) : '',
        p.paymentType?.name ?? '',
        p.installment?.name ?? '',
        p.transferContent ?? '',
        formatDate(p.transferDate),
        o?.customer?.name ?? '',
        o?.customer?.phone ?? '',
        o?.product?.name ?? '',
        o?.companyName ?? '',
        o?.taxCode ?? '',
        o?.contactPerson ?? '',
        o?.address ?? '',
        o?.vatEmail ?? '',
        o?.orderFormat?.name ?? o?.format ?? '',
        o?.productGroup?.name ?? '',
        o?.stt ?? '',
        o?.courseCode ?? '',
        o?.notes ?? '',
        p.verifiedSource === 'AUTO' ? 'Auto' : 'Thủ công',
        p.verifier?.name ?? '',
        formatDate(p.verifiedAt),
      ]);
    });

    // Format amount columns (B = col 2, C = col 3)
    [2, 3].forEach((col) => {
      sheet.getColumn(col).numFmt = '#,##0';
    });

    // Auto column widths
    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value != null ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** Export CSV theo dung filter dang ap dung tren trang /orders (MANAGER+). */
  /** Load payments khớp filter cho các endpoint export (bounded để tránh OOM). */
  private loadPaymentsForExport(query: PaymentListFilter, user?: CurrentUser) {
    return this.prisma.payment.findMany({
      where: this.buildListWhere(query, user),
      select: PAYMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10000,
    });
  }

  async exportFiltered(query: PaymentListFilter, user?: CurrentUser): Promise<string> {
    const payments = await this.loadPaymentsForExport(query, user);

    const statusLabel: Record<string, string> = {
      PENDING: 'Chờ xử lý', VERIFIED: 'Đã xác minh', REJECTED: 'Từ chối', REFUNDED: 'Hoàn tiền',
    };
    const orderStatusLabel: Record<string, string> = {
      PENDING: 'Chờ thanh toán', COMPLETED: 'Hoàn tất',
    };
    const formatDateVi = (d: Date | string | null | undefined): string => {
      if (!d) return '';
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${dt.getFullYear()}`;
    };

    const rows = payments.map((p, idx) => {
      const o = p.order;
      const m = p.matchedTransaction;
      return sanitizeCsvRow({
        '#': idx + 1,
        'Số tiền': Number(p.amount),
        'Tiền VAT': p.vatAmount != null ? Number(p.vatAmount) : '',
        'Loại CK': p.paymentType?.name ?? '',
        'Lần CK': p.installment?.name ?? '',
        'Nội dung CK': p.transferContent ?? '',
        'Ngày CK': formatDateVi(p.transferDate),
        'Trạng thái TT': statusLabel[p.status] ?? p.status,
        'Lý do TT': p.statusReason ?? '',
        'Tỷ lệ hoàn thành': p.completionRate != null ? Number(p.completionRate) : '',
        'Tài khoản nhận': p.bankAccount?.name ?? '',
        'Nguồn xác minh': p.verifiedSource ?? '',
        'GD khớp - Mã': m?.externalId ?? '',
        'GD khớp - Người gửi': m?.senderName ?? '',
        'GD khớp - Thời gian': formatDateVi(m?.transactionTime),
        // Khớp đúng cột "Khách hàng" trên bảng UI: customerName của đơn trước, fallback tên customer.
        'Khách hàng': o?.customerName || o?.customer?.name || '',
        'SĐT': o?.customer?.phone ?? o?.customerPhone ?? '',
        'Sản phẩm': o?.product?.name ?? '',
        'Nhóm SP': o?.productGroup?.name ?? '',
        'Người tạo': o?.creator?.name ?? '',
        'Đội nhóm': o?.creator?.team?.name ?? '',
        'Hình thức': o?.orderFormat?.name ?? o?.format ?? '',
        'STT': o?.stt ?? '',
        'Mã khoá': o?.courseCode ?? '',
        'Trạng thái đơn': o?.status ? (orderStatusLabel[o.status] ?? o.status) : '',
        'Giá trị đơn': o?.amount != null ? Number(o.amount) : '',
        'Thuế suất (%)': o?.vatRate != null ? Number(o.vatRate) : '',
        'Tổng tiền đơn': o?.totalAmount != null ? Number(o.totalAmount) : '',
        'Tên công ty': o?.companyName ?? '',
        'MST': o?.taxCode ?? '',
        'Người liên hệ': o?.contactPerson ?? '',
        'Địa chỉ': o?.address ?? '',
        'Mail VAT': o?.vatEmail ?? '',
        'Nguồn lead': o?.lead?.source?.name ?? '',
        'Nhóm lead': o?.lead?.group?.name ?? '',
        'Ghi chú': o?.notes ?? '',
        'Người xác nhận': p.verifier?.name ?? '',
        'Ngày xác nhận': formatDateVi(p.verifiedAt),
        'Ngày tạo': formatDateVi(p.createdAt),
      });
    });

    return stringify(rows, { header: true });
  }

  /**
   * Export CSV "dạng kế toán" - khớp khuôn file đối soát (sheet KD, 22 cột A-V).
   * Khác exportFiltered: mỗi dòng góc nhìn payment + người/team TẠO payment (không
   * phải người tạo order). Dùng chung buildListWhere nên tôn trọng filter đang lọc.
   */
  async exportAccountingCsv(query: PaymentListFilter, user?: CurrentUser): Promise<string> {
    const payments = await this.loadPaymentsForExport(query, user);

    const statusLabel: Record<string, string> = {
      PENDING: 'Chờ xử lý', VERIFIED: 'Đã thanh toán', REJECTED: 'Từ chối', REFUNDED: 'Hoàn tiền',
    };
    const formatDateVi = (d: Date | string | null | undefined): string => {
      if (!d) return '';
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${dt.getFullYear()}`;
    };

    const rows = payments.map((p) => {
      const o = p.order;
      const amount = Number(p.amount);
      const vat = p.vatAmount != null ? Number(p.vatAmount) : 0;
      return sanitizeCsvRow({
        'NGÀY': formatDateVi(p.transferDate),
        'NHÂN VIÊN': p.creator?.name ?? '',
        'NHÓM': o?.productGroup?.name ?? '',
        'STT CỦA LỚP': o?.stt ?? '',
        'NGUỒN': o?.lead?.source?.name ?? '',
        'TÊN': o?.customerName || o?.customer?.name || '',
        'SỐ ĐIỆN THOẠI': o?.customer?.phone ?? o?.customerPhone ?? '',
        'ĐỊA CHỈ KHÁCH': o?.address ?? '',
        'TÊN SẢN PHẨM': o?.product?.name ?? '',
        'GIÁ BÁN NIÊM YẾT': o?.totalAmount != null ? Number(o.totalAmount) : '',
        'DOANH THU VỀ CÔNG TY': amount,
        '% VAT': o?.vatRate != null ? Number(o.vatRate) : '',
        'THUẾ VAT': p.vatAmount != null ? vat : '',
        'DOANH SỐ GHI NHẬN': amount - vat,
        'SỐ LẦN TT': p.installment?.name ?? '',
        'NGÀY TT LẦN 1': formatDateVi(p.transferDate),
        'TÌNH TRẠNG TT': statusLabel[p.status] ?? p.status,
        'HÌNH THỨC TT': p.paymentType?.name ?? '',
        'NGÂN HÀNG': p.bankAccount?.name ?? '',
        'MÃ GD': p.transferContent ?? '',
        'GHI CHÚ': o?.notes ?? '',
        'TEAM': p.creator?.team?.name ?? '',
      });
    });

    return stringify(rows, { header: true });
  }
}
