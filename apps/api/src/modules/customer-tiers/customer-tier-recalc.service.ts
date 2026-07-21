import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma, ActivityType, EntityType } from '@prisma/client';
import { CustomerTiersService } from './customer-tiers.service';
import { findTierByTotalSpent } from './helpers/find-tier-by-total-spent';
import { SYSTEM_USER_ID } from '../../common/constants/system-user';

/**
 * Tính lại tier cho 1 customer dựa SUM(payments.amount WHERE status=VERIFIED).
 * Hook chạy trong transaction của payment verify - rollback nếu fail.
 *
 * Idempotent: không write nếu totalSpent + currentTierId không đổi.
 * Log TIER_CHANGE activity nếu tier thực sự đổi (lên/xuống hạng).
 */
@Injectable()
export class CustomerTierRecalcService {
  private readonly logger = new Logger(CustomerTierRecalcService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tiersService: CustomerTiersService,
  ) {}

  /**
   * Recalc tier cho 1 customer.
   * @param customerId - BigInt id
   * @param tx - Optional transaction client. Nếu có, tất cả write chạy trong tx.
   */
  async recalcForCustomer(customerId: bigint, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;

    const [agg, customer, tiers] = await Promise.all([
      // Payment không có customerId trực tiếp - phải qua order.customerId.
      // Loại order soft-deleted để không double-count.
      // Tier tính theo ví công ty = tiền thật khách đã trả = VERIFIED + REJECTED
      // (REJECTED = tiền có về dù sale nhập sai; lỗi của sale, không phạt khách).
      db.payment.aggregate({
        where: {
          status: { in: ['VERIFIED', 'REJECTED'] },
          order: { customerId, deletedAt: null },
        },
        _sum: { amount: true },
      }),
      db.customer.findUnique({
        where: { id: customerId },
        select: { id: true, currentTierId: true, totalSpent: true },
      }),
      this.tiersService.listSortedDesc(),
    ]);

    if (!customer) {
      this.logger.warn({ customerId: customerId.toString() }, 'recalc-skip: customer not found');
      return;
    }

    const totalSpent = agg?._sum?.amount ?? new Prisma.Decimal(0);
    const newTier = findTierByTotalSpent(totalSpent, tiers);
    const newTierId = newTier?.id ?? null;

    // Skip write nếu không đổi (tránh transaction bloat khi recalc lặp)
    const tierChanged = customer.currentTierId !== newTierId;
    const spentChanged = !customer.totalSpent.eq(totalSpent);
    if (!tierChanged && !spentChanged) return;

    await db.customer.update({
      where: { id: customerId },
      data: { totalSpent, currentTierId: newTierId },
    });

    // Log TIER_CHANGE activity chỉ khi tier thực sự đổi (không log mỗi lần totalSpent thay đổi)
    if (tierChanged) {
      await db.activity.create({
        data: {
          entityType: EntityType.CUSTOMER,
          entityId: customerId,
          userId: SYSTEM_USER_ID, // system user (id=1) - FK activity.user_id, không phải user trigger
          type: ActivityType.TIER_CHANGE,
          content: this.buildTierChangeContent(customer.currentTierId, newTierId, tiers),
          metadata: {
            fromTierId: customer.currentTierId?.toString() ?? null,
            toTierId: newTierId?.toString() ?? null,
            totalSpent: totalSpent.toString(),
          },
        },
      });
    }
  }

  private buildTierChangeContent(
    fromTierId: bigint | null,
    toTierId: bigint | null,
    tiers: Array<{ id: bigint; name: string }>,
  ): string {
    const fromName = fromTierId ? tiers.find((t) => t.id === fromTierId)?.name ?? 'Chưa xếp hạng' : 'Chưa xếp hạng';
    const toName = toTierId ? tiers.find((t) => t.id === toTierId)?.name ?? 'Chưa xếp hạng' : 'Chưa xếp hạng';
    if (!fromTierId) return `Khởi tạo hạng: ${toName}`;
    if (!toTierId) return `Tụt xuống: chưa xếp hạng (từ ${fromName})`;
    return `Thay đổi hạng: ${fromName} → ${toName}`;
  }

  /**
   * Bulk recalc toàn bộ customer. Dùng khi:
   *  - SUPER_ADMIN trigger từ /customer-tiers/recalc-all
   *  - Sau khi đổi minSpending của tier
   *
   * Chunked 100/batch, no transaction (eventual consistency OK).
   * Return số lượng customer đã xử lý.
   */
  async recalcAll(): Promise<{ processed: number }> {
    const CHUNK = 100;
    let processed = 0;
    let cursor: bigint | undefined;

    while (true) {
      const batch = await this.prisma.customer.findMany({
        where: { deletedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: CHUNK,
      });
      if (batch.length === 0) break;

      for (const c of batch) {
        try {
          await this.recalcForCustomer(c.id);
          processed++;
        } catch (e) {
          this.logger.error({ customerId: c.id.toString(), err: (e as Error).message }, 'recalc-bulk-error');
        }
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < CHUNK) break;
    }

    this.logger.log({ processed }, 'recalc-bulk-completed');
    return { processed };
  }
}
