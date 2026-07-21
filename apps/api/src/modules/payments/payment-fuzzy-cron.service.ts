import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { PaymentScoringService } from './payment-scoring.service';
import { PaymentMatchingService, ORDER_MATCHABLE_FILTER } from './payment-matching.service';
import { CustomerTierRecalcService } from '../customer-tiers/customer-tier-recalc.service';
import { CronRunService } from '../cron-run/cron-run.service';
import { SYSTEM_USER_ID } from '../../common/constants/system-user';

const AMOUNT_TOLERANCE = 5000;
const STRICT_THRESHOLD = 90;
const FUZZY_THRESHOLD = 65;
const MAX_PENDING_PER_RUN = 500;
const MAX_CANDIDATES_PER_PAYMENT = 20;

// Khoảng cách điểm tối thiểu giữa ứng viên top và á quân để coi là "rõ ràng".
// Nếu hai ứng viên sát nhau (thường do trùng tiền + nội dung na ná) thì KHÔNG
// tự verify - hạ xuống fuzzy để người duyệt chọn tay, tránh ghép nhầm.
const AMBIGUITY_MARGIN = 10;

interface PassResult {
  strictMatched: number;
  fuzzyMarked: number;
  skipped: number;
  totalScanned: number;
}

/**
 * Cron 2h: relaxed match pass. Scores PENDING payment against UNMATCHED bank tx.
 * Score >= 90 (và cách á quân >= AMBIGUITY_MARGIN) -> AUTO_MATCHED + VERIFIED.
 * Score 65-89, hoặc >=90 nhưng nhiều ứng viên sát điểm -> FUZZY_MATCHED, payment
 * giữ PENDING cho SA xác nhận.
 * Score < 65 -> skip.
 */
@Injectable()
export class PaymentFuzzyCronService {
  private readonly logger = new Logger(PaymentFuzzyCronService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly scoring: PaymentScoringService,
    private readonly matching: PaymentMatchingService,
    private readonly tierRecalcService: CustomerTierRecalcService,
    private readonly cronRunService: CronRunService,
  ) {}

  @Cron('0 */2 * * *')
  async runFuzzyMatchPass() {
    try {
      await this.cronRunService.track('payment-fuzzy-match', (ctx) => this.trackedPass(ctx));
    } catch (err) {
      this.logger.error('Fuzzy match cron failed', err);
    }
  }

  /**
   * Chạy quét fuzzy thủ công (nút bấm trên UI) - không đợi cron 2h.
   * Trả counts để hiển thị toast. Lỗi ném lên cho controller xử lý.
   */
  async runManual(): Promise<PassResult> {
    return this.cronRunService.track('payment-fuzzy-match-manual', (ctx) => this.trackedPass(ctx));
  }

  /** Bọc executePass + ghi metadata/log vào cron-run context (dùng chung cron + manual). */
  private async trackedPass(ctx: { affected?: number; metadata?: unknown }): Promise<PassResult> {
    const result = await this.executePass();
    ctx.affected = result.strictMatched + result.fuzzyMarked;
    ctx.metadata = result;
    this.logger.log(
      `Fuzzy match pass: ${result.strictMatched} strict, ${result.fuzzyMarked} fuzzy, ${result.skipped} skip / ${result.totalScanned} scanned`,
    );
    return result;
  }

  /** Quét payment PENDING, chấm điểm với bank tx UNMATCHED, auto/fuzzy/skip từng cái. */
  private async executePass(): Promise<PassResult> {
    const pending = await this.prisma.payment.findMany({
      // Loai payment cua don huy/hoan tien/xoa mem - match se hoi sinh don
      where: { status: 'PENDING', transferContent: { not: null }, order: ORDER_MATCHABLE_FILTER },
      select: {
        id: true,
        amount: true,
        transferContent: true,
        transferDate: true,
        createdAt: true,
        order: { select: { customer: { select: { name: true } } } },
      },
      take: MAX_PENDING_PER_RUN,
      orderBy: { createdAt: 'desc' },
    });

    let strictMatched = 0;
    let fuzzyMarked = 0;
    let skipped = 0;

    for (const payment of pending) {
      const result = await this.processPayment(payment);
      if (result === 'STRICT') strictMatched++;
      else if (result === 'FUZZY') fuzzyMarked++;
      else skipped++;
    }

    return { strictMatched, fuzzyMarked, skipped, totalScanned: pending.length };
  }

  private async processPayment(payment: any): Promise<'STRICT' | 'FUZZY' | 'SKIP'> {
    const amountNum = Number(payment.amount);
    const candidates = await this.prisma.bankTransaction.findMany({
      where: {
        matchStatus: 'UNMATCHED',
        amount: { gte: amountNum - AMOUNT_TOLERANCE, lte: amountNum + AMOUNT_TOLERANCE },
      },
      take: MAX_CANDIDATES_PER_PAYMENT,
      orderBy: { transactionTime: 'desc' },
    });

    let best: { tx: any; score: number; reasons: any[] } | null = null;
    let secondScore = -1; // điểm ứng viên tốt thứ nhì, để đánh giá độ mơ hồ
    for (const tx of candidates) {
      const result = this.scoring.scorePair(payment, tx);
      if (!result) continue;
      if (!best || result.score > best.score) {
        secondScore = best ? best.score : secondScore;
        best = { tx, score: result.score, reasons: result.reasons };
      } else if (result.score > secondScore) {
        secondScore = result.score;
      }
    }

    if (!best) return 'SKIP';

    // Auto-verify chỉ khi điểm cao VÀ ứng viên top vượt trội á quân rõ ràng.
    // Nhiều ứng viên sát điểm -> mơ hồ -> hạ xuống fuzzy cho người duyệt.
    const isAmbiguous = secondScore >= 0 && best.score - secondScore < AMBIGUITY_MARGIN;

    if (best.score >= STRICT_THRESHOLD && !isAmbiguous) {
      const ok = await this.attemptStrictMatch(payment.id, best.tx.id);
      return ok ? 'STRICT' : 'SKIP';
    }
    if (best.score >= FUZZY_THRESHOLD) {
      const ok = await this.attemptFuzzyMark(payment.id, best.tx.id, best.score, best.reasons);
      return ok ? 'FUZZY' : 'SKIP';
    }
    return 'SKIP';
  }

  /** Atomic claim - bank tx promoted to AUTO_MATCHED, payment promoted to VERIFIED. */
  private async attemptStrictMatch(paymentId: bigint, bankTxId: bigint): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimedTx = await tx.bankTransaction.updateMany({
          where: { id: bankTxId, matchStatus: 'UNMATCHED' },
          data: { matchedPaymentId: paymentId, matchStatus: 'AUTO_MATCHED' },
        });
        if (claimedTx.count === 0) return false;

        const claimedPayment = await tx.payment.updateMany({
          where: { id: paymentId, status: 'PENDING' },
          data: {
            status: 'VERIFIED',
            verifiedBy: SYSTEM_USER_ID, // audit trail: AUTO match cũng phải có actor
            verifiedSource: 'AUTO',
            verifiedAt: new Date(),
          },
        });
        if (claimedPayment.count === 0) {
          // Rollback bank tx
          await tx.bankTransaction.update({
            where: { id: bankTxId },
            data: { matchedPaymentId: null, matchStatus: 'UNMATCHED' },
          });
          return false;
        }

        await this.matching.checkConversionTrigger(tx, paymentId);

        // Recalc tier khách hàng sau auto-verify
        const p = await tx.payment.findUnique({
          where: { id: paymentId },
          select: { order: { select: { customerId: true } } },
        });
        if (p?.order?.customerId) {
          await this.tierRecalcService.recalcForCustomer(p.order.customerId, tx);
        }

        return true;
      });
    } catch {
      return false;
    }
  }

  /** Mark bank tx FUZZY_MATCHED + link payment. Payment stays PENDING - SA confirms later. */
  private async attemptFuzzyMark(
    paymentId: bigint,
    bankTxId: bigint,
    score: number,
    reasons: any[],
  ): Promise<boolean> {
    try {
      const claimed = await this.prisma.bankTransaction.updateMany({
        where: { id: bankTxId, matchStatus: 'UNMATCHED' },
        data: {
          matchStatus: 'FUZZY_MATCHED',
          matchedPaymentId: paymentId,
          matchScore: score,
          matchReasons: reasons,
        },
      });
      return claimed.count > 0;
    } catch {
      return false;
    }
  }
}
