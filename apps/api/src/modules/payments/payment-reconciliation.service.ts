import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PaymentScoringService } from './payment-scoring.service';
import { parseVnDateTime } from '../../common/utils/vn-timezone';

// Ngưỡng điểm coi 1 cặp là "gợi ý map được". Kế toán vẫn duyệt tay từng cặp,
// nên để thấp - miễn có tín hiệu nội dung/tên là gợi ý, tránh bỏ sót.
const MAPPED_SCORE_THRESHOLD = 40;

// Trần số phép chấm điểm (payment × bank) trong 1 mệnh giá. Vượt -> bỏ fuzzy
// scoring để tránh chặn request (mỗi phép chạy Levenshtein). ~200 payment ×
// 200 bank là quá đủ cho kỳ đối soát thực tế (thường 1 ngày, vài trăm giao dịch).
const MAX_FUZZY_PAIRS = 40_000;

// Select tối thiểu đủ cho scoring (content + tên khách + ngày) và hiển thị.
const RECON_PAYMENT_SELECT = {
  id: true,
  amount: true,
  status: true,
  transferContent: true,
  transferDate: true,
  createdAt: true,
  installment: { select: { name: true } },
  order: {
    select: {
      id: true,
      customerName: true,
      product: { select: { name: true } },
      customer: { select: { name: true } },
      lead: { select: { source: { select: { name: true } } } },
    },
  },
} satisfies Prisma.PaymentSelect;

const RECON_BANKTX_SELECT = {
  id: true,
  amount: true,
  content: true,
  senderName: true,
  senderAccount: true,
  transactionTime: true,
  matchStatus: true,
  matchedPaymentId: true,
} satisfies Prisma.BankTransactionSelect;

type ReconPayment = Prisma.PaymentGetPayload<{ select: typeof RECON_PAYMENT_SELECT }>;
type ReconBankTx = Prisma.BankTransactionGetPayload<{ select: typeof RECON_BANKTX_SELECT }>;

export type DenomStatus = 'ok' | 'warn' | 'err';

@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scoring: PaymentScoringService,
  ) {}

  async getReconciliation(fromRaw: string, toRaw: string, bankAccount?: string) {
    const from = parseVnDateTime(fromRaw);
    const to = parseVnDateTime(toRaw);
    if (!from || !to) {
      throw new BadRequestException('Thời gian from/to không hợp lệ');
    }
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('Thời gian bắt đầu phải nhỏ hơn hoặc bằng thời gian kết thúc');
    }

    // Lọc theo ngân hàng: bỏ trống = tất cả. CHỈ áp cho phía Sale (payment.bankAccount).
    // Phía bank KHÔNG lọc theo tên - file sao kê không có cột tên TK nên bankAccount
    // gần như luôn NULL; lọc sẽ ra rỗng. Lấy hết giao dịch bank trong kỳ để đối soát.
    const bank = bankAccount?.trim() || undefined;

    // Phía Sale: mọi phiếu trong kỳ TRỪ CANCELLED (gồm PENDING+VERIFIED+REJECTED+REFUNDED).
    // Trục thời gian = transferDate (ngày sale khai chuyển).
    const [payments, bankTxs] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          transferDate: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          ...(bank ? { bankAccount: { name: bank } } : {}),
        },
        select: RECON_PAYMENT_SELECT,
      }),
      this.prisma.bankTransaction.findMany({
        where: {
          transactionTime: { gte: from, lte: to },
          matchStatus: { not: 'IGNORED' },
        },
        select: RECON_BANKTX_SELECT,
      }),
    ]);

    return this.buildResult(payments, bankTxs);
  }

  /**
   * Chay doi soat + luu 1 dong lich su (ban tom tat nhe). Tra ve result day du
   * de frontend hien thi luon. Chi tiet ghep cap KHONG snapshot - mo lai "chay
   * lai" se tinh tu du lieu song.
   */
  async saveRun(fromRaw: string, toRaw: string, userId: bigint, bankAccount?: string) {
    const from = parseVnDateTime(fromRaw);
    const to = parseVnDateTime(toRaw);
    if (!from || !to) throw new BadRequestException('Thời gian from/to không hợp lệ');

    const result = await this.getReconciliation(fromRaw, toRaw, bankAccount);
    await this.prisma.reconciliationRun.create({
      data: {
        fromDate: from,
        toDate: to,
        runBy: userId,
        summary: result.summary as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  /** List lich su doi soat (cursor pagination). */
  async listRuns(limit = 20, cursor?: string) {
    const rows = await this.prisma.reconciliationRun.findMany({
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id.toString() : undefined } };
  }

  /** Gom theo mệnh giá (amount) rồi ghép cặp trong từng mệnh giá. */
  private buildResult(payments: ReconPayment[], bankTxs: ReconBankTx[]) {
    const amounts = new Set<string>();
    const payByAmount = new Map<string, ReconPayment[]>();
    const bankByAmount = new Map<string, ReconBankTx[]>();

    for (const p of payments) {
      const key = String(Number(p.amount));
      amounts.add(key);
      const list = payByAmount.get(key) ?? [];
      list.push(p);
      payByAmount.set(key, list);
    }
    for (const b of bankTxs) {
      const key = String(Number(b.amount));
      amounts.add(key);
      const list = bankByAmount.get(key) ?? [];
      list.push(b);
      bankByAmount.set(key, list);
    }

    const denominations = [...amounts]
      .map((key) => this.buildDenomination(Number(key), payByAmount.get(key) ?? [], bankByAmount.get(key) ?? []))
      .sort((a, b) => b.amount - a.amount);

    // Tổng hợp header.
    let saleGrandSum = 0;
    let bankGrandSum = 0;
    let okDenomCount = 0;
    let mappedGrandTotal = 0;
    let pairGrandTotal = 0;
    for (const d of denominations) {
      saleGrandSum += d.saleSum;
      bankGrandSum += d.bankSum;
      if (d.status === 'ok') okDenomCount += 1;
      mappedGrandTotal += d.mappedCount;
      pairGrandTotal += d.pairTotal;
    }

    return {
      denominations,
      summary: {
        saleTxTotal: payments.length,
        bankTxTotal: bankTxs.length,
        saleGrandSum,
        bankGrandSum,
        grandDiff: bankGrandSum - saleGrandSum,
        okDenomCount,
        totalDenomCount: denominations.length,
        mappedGrandTotal,
        pairGrandTotal,
      },
    };
  }

  /** Xây 1 dòng mệnh giá: đếm SL, tổng tiền, ghép cặp greedy, tính status. */
  private buildDenomination(amount: number, pays: ReconPayment[], banks: ReconBankTx[]) {
    const saleSum = pays.reduce((s, p) => s + Number(p.amount), 0);
    const bankSum = banks.reduce((s, b) => s + Number(b.amount), 0);
    const diff = bankSum - saleSum;

    const pairs = this.matchPairs(pays, banks);
    const mappedCount = pairs.filter((p) => p.mapped).length;
    // pairTotal = số cặp "lý tưởng" cần map = min(SL sale, SL bank).
    const pairTotal = Math.min(pays.length, banks.length);

    let status: DenomStatus;
    if (pays.length !== banks.length || diff !== 0) {
      status = 'err';
    } else if (mappedCount < pairTotal) {
      status = 'warn';
    } else {
      status = 'ok';
    }

    return {
      amount,
      saleCount: pays.length,
      bankCount: banks.length,
      saleSum,
      bankSum,
      diff,
      mappedCount,
      pairTotal,
      status,
      pairs,
    };
  }

  /**
   * Ghép 1-1 giữa payment và bankTx trong cùng mệnh giá theo điểm khớp tên/nội
   * dung. Greedy: chấm mọi cặp, sort điểm giảm dần, gán khi cả hai bên còn trống.
   * Cặp có điểm >= ngưỡng -> mapped=true (gợi ý). Payment/bank thừa -> cặp lệch.
   */
  private matchPairs(pays: ReconPayment[], banks: ReconBankTx[]) {
    const usedPay = new Set<number>();
    const usedBank = new Set<number>();
    const pairs: Array<{
      paymentId?: string;
      bankTxId?: string;
      score: number;
      mapped: boolean;
      reasons: unknown[];
      payment?: unknown;
      bankTx?: unknown;
    }> = [];

    // Ton trong link da luu trong DB truoc khi greedy fuzzy: 1 bank da ghep
    // (matchedPaymentId) phai dinh dung payment cua no. Neu bo qua, greedy co the
    // keo payment sang mot bank khac diem cao hon -> hien thi sai cap da ghep.
    const payIndexById = new Map<string, number>();
    pays.forEach((p, i) => payIndexById.set(String(p.id), i));
    for (let bi = 0; bi < banks.length; bi++) {
      const pid = banks[bi].matchedPaymentId ? String(banks[bi].matchedPaymentId) : null;
      if (!pid) continue;
      const pi = payIndexById.get(pid);
      if (pi === undefined || usedPay.has(pi)) continue;
      usedPay.add(pi);
      usedBank.add(bi);
      pairs.push({
        paymentId: pid,
        bankTxId: String(banks[bi].id),
        score: 100,
        mapped: true,
        reasons: [],
        payment: this.serializePayment(pays[pi]),
        bankTx: this.serializeBankTx(banks[bi]),
      });
    }

    type Cand = { pi: number; bi: number; score: number; reasons: unknown[] };
    const cands: Cand[] = [];
    // Guard N²: mỗi cặp chạy Levenshtein trên nội dung/tên. 1 mệnh giá cực đông
    // (vd nhiều trăm CK cùng số tiền) sẽ tạo hàng chục nghìn phép so, chặn request.
    // Vượt ngưỡng -> bỏ fuzzy, ghép theo thứ tự (score 0) để kế toán tự map tay.
    const skipFuzzy = pays.length * banks.length > MAX_FUZZY_PAIRS;
    for (let pi = 0; pi < pays.length; pi++) {
      if (usedPay.has(pi)) continue;
      for (let bi = 0; bi < banks.length; bi++) {
        if (usedBank.has(bi)) continue;
        const bank = banks[bi];
        if (skipFuzzy) {
          cands.push({ pi, bi, score: 0, reasons: [] });
          continue;
        }
        const scored = this.scoring.scorePair(
          {
            amount: pays[pi].amount as unknown as number,
            transferContent: pays[pi].transferContent,
            transferDate: pays[pi].transferDate,
            createdAt: pays[pi].createdAt,
            order: { customer: { name: pays[pi].order?.customer?.name ?? pays[pi].order?.customerName ?? null } },
          },
          {
            amount: bank.amount as unknown as number,
            content: bank.content,
            senderName: bank.senderName,
            transactionTime: bank.transactionTime,
          },
        );
        if (scored) cands.push({ pi, bi, score: scored.score, reasons: scored.reasons });
      }
    }
    cands.sort((a, b) => b.score - a.score);

    for (const c of cands) {
      if (usedPay.has(c.pi) || usedBank.has(c.bi)) continue;
      usedPay.add(c.pi);
      usedBank.add(c.bi);
      const pay = pays[c.pi];
      const bank = banks[c.bi];
      pairs.push({
        paymentId: String(pay.id),
        bankTxId: String(bank.id),
        score: c.score,
        mapped: c.score >= MAPPED_SCORE_THRESHOLD,
        reasons: c.reasons,
        payment: this.serializePayment(pay),
        bankTx: this.serializeBankTx(bank),
      });
    }

    // Payment thừa (không ghép được bank).
    for (let pi = 0; pi < pays.length; pi++) {
      if (usedPay.has(pi)) continue;
      pairs.push({ paymentId: String(pays[pi].id), score: 0, mapped: false, reasons: [], payment: this.serializePayment(pays[pi]) });
    }
    // Bank thừa (không ghép được payment).
    for (let bi = 0; bi < banks.length; bi++) {
      if (usedBank.has(bi)) continue;
      pairs.push({ bankTxId: String(banks[bi].id), score: 0, mapped: false, reasons: [], bankTx: this.serializeBankTx(banks[bi]) });
    }

    return pairs;
  }

  private serializePayment(p: ReconPayment) {
    return {
      id: String(p.id),
      amount: Number(p.amount),
      status: p.status,
      transferContent: p.transferContent,
      transferDate: p.transferDate,
      customerName: p.order?.customer?.name ?? p.order?.customerName ?? null,
      productName: p.order?.product?.name ?? null,
      sourceName: p.order?.lead?.source?.name ?? null,
      installmentName: p.installment?.name ?? null,
      createdAt: p.createdAt,
    };
  }

  private serializeBankTx(b: ReconBankTx) {
    return {
      id: String(b.id),
      amount: Number(b.amount),
      content: b.content,
      senderName: b.senderName,
      senderAccount: b.senderAccount,
      transactionTime: b.transactionTime,
      matchStatus: b.matchStatus,
      matchedPaymentId: b.matchedPaymentId ? String(b.matchedPaymentId) : null,
    };
  }
}
