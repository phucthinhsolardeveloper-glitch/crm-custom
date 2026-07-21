import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PaymentScoringService } from './payment-scoring.service';
import { PaymentMatchingService, ORDER_MATCHABLE_FILTER } from './payment-matching.service';

const AMOUNT_TOLERANCE = 5000;
const MIN_DISPLAY_SCORE = 30;

/**
 * Smart suggest + bulk confirm/reject for fuzzy queue.
 * Split out from PaymentsService to keep file size manageable.
 */
@Injectable()
export class PaymentSuggestService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scoring: PaymentScoringService,
    private readonly matching: PaymentMatchingService,
  ) {}

  /** Top N ranked unmatched bank transactions for a payment. */
  async suggestCandidates(paymentId: bigint, limit = 5) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        transferContent: true,
        transferDate: true,
        createdAt: true,
        order: { select: { customer: { select: { name: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Thanh toán không tồn tại');

    const amountNum = Number(payment.amount);
    const candidates = await this.prisma.bankTransaction.findMany({
      where: {
        matchStatus: 'UNMATCHED',
        amount: {
          gte: amountNum - AMOUNT_TOLERANCE,
          lte: amountNum + AMOUNT_TOLERANCE,
        },
      },
      take: 50,
      orderBy: { transactionTime: 'desc' },
    });

    const scored = candidates
      .map((tx) => {
        const result = this.scoring.scorePair(payment, tx);
        return result ? { bankTx: tx, ...result } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.score >= MIN_DISPLAY_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return { payment, candidates: scored };
  }

  /** List FUZZY_MATCHED bank tx awaiting SA confirmation. */
  async listFuzzyQueue(query: { minScore?: number; limit?: number; cursor?: string }) {
    const minScore = query.minScore ?? 60;
    const limit = Math.min(query.limit ?? 50, 100);

    const txs = await this.prisma.bankTransaction.findMany({
      where: {
        matchStatus: 'FUZZY_MATCHED',
        matchScore: { gte: minScore },
      },
      include: {
        matchedPayment: {
          select: {
            id: true,
            amount: true,
            transferContent: true,
            transferDate: true,
            paymentType: { select: { id: true, name: true } },
            order: {
              select: {
                id: true,
                customer: { select: { id: true, name: true, phone: true } },
                product: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ matchScore: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = txs.length > limit;
    const data = (hasMore ? txs.slice(0, limit) : txs).map((tx) => ({
      bankTx: {
        id: tx.id,
        amount: tx.amount,
        content: tx.content,
        senderName: tx.senderName,
        transactionTime: tx.transactionTime,
      },
      payment: tx.matchedPayment,
      score: tx.matchScore,
      reasons: tx.matchReasons,
    }));

    return {
      data,
      meta: {
        nextCursor: hasMore && data.length ? data[data.length - 1].bankTx.id?.toString() : undefined,
      },
    };
  }

  /** Promote FUZZY pairs to AUTO_MATCHED + VERIFIED. Per-item atomic claim. */
  async bulkConfirmFuzzy(bankTxIds: bigint[], userId: bigint) {
    let confirmed = 0;
    let skipped = 0;
    const errors: { bankTxId: string; reason: string }[] = [];

    for (const bankTxId of bankTxIds) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const bankTx = await tx.bankTransaction.findUnique({ where: { id: bankTxId } });
          if (!bankTx || bankTx.matchStatus !== 'FUZZY_MATCHED' || !bankTx.matchedPaymentId) {
            throw new ConflictException('Bank tx không ở trạng thái FUZZY_MATCHED');
          }

          // Atomic claim: chỉ thắng nếu chưa ai promote
          const claimed = await tx.bankTransaction.updateMany({
            where: { id: bankTxId, matchStatus: 'FUZZY_MATCHED' },
            data: { matchStatus: 'AUTO_MATCHED' },
          });
          if (claimed.count === 0) throw new ConflictException('Đã được xử lý');

          // Guard: payment phai con PENDING va don chua huy/hoan tien/xoa mem
          // (don huy sau khi mark FUZZY -> payment da REJECTED, khong duoc lat lai VERIFIED)
          const verified = await tx.payment.updateMany({
            where: {
              id: bankTx.matchedPaymentId,
              status: 'PENDING',
              order: ORDER_MATCHABLE_FILTER,
            },
            data: {
              status: 'VERIFIED',
              verifiedSource: 'AUTO_FUZZY',
              verifiedBy: userId,
              verifiedAt: new Date(),
            },
          });
          if (verified.count === 0) {
            throw new ConflictException('Payment không còn PENDING hoặc đơn hàng đã huỷ/hoàn tiền/xoá');
          }

          await this.matching.checkConversionTrigger(tx, bankTx.matchedPaymentId);
        });
        confirmed++;
      } catch (e: any) {
        skipped++;
        errors.push({ bankTxId: bankTxId.toString(), reason: e?.message || 'unknown' });
      }
    }

    return { confirmed, skipped, errors };
  }

  /** Revert FUZZY suggestions back to UNMATCHED. */
  async bulkRejectFuzzy(bankTxIds: bigint[]) {
    const result = await this.prisma.bankTransaction.updateMany({
      where: { id: { in: bankTxIds }, matchStatus: 'FUZZY_MATCHED' },
      data: {
        matchStatus: 'UNMATCHED',
        matchedPaymentId: null,
        matchScore: null,
        matchReasons: Prisma.DbNull as any,
      },
    });
    return { reverted: result.count, skipped: bankTxIds.length - result.count };
  }

  /** Lightweight stats for the dashboard header bar. */
  async getStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [pendingCount, unmatchedCount, fuzzyCount, todayMatchedCount, weekTotal, weekAuto] = await Promise.all([
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.bankTransaction.count({ where: { matchStatus: 'UNMATCHED' } }),
      this.prisma.bankTransaction.count({ where: { matchStatus: 'FUZZY_MATCHED' } }),
      this.prisma.payment.count({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfToday } } }),
      this.prisma.payment.count({ where: { status: 'VERIFIED', verifiedAt: { gte: sevenDaysAgo } } }),
      this.prisma.payment.count({
        where: {
          status: 'VERIFIED',
          verifiedAt: { gte: sevenDaysAgo },
          verifiedSource: { in: ['AUTO', 'AUTO_FUZZY'] },
        },
      }),
    ]);

    const autoMatchRate = weekTotal === 0 ? 0 : Math.round((weekAuto / weekTotal) * 100);
    return { pendingCount, unmatchedCount, fuzzyCount, todayMatchedCount, autoMatchRate };
  }
}

