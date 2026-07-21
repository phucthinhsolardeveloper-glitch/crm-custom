import type { CustomerTier } from '@prisma/client';
import { Prisma } from '@prisma/client';

/**
 * Trả về tier cao nhất mà customer đủ điều kiện theo totalSpent.
 *
 * Caller MUST pre-sort tiersSortedDesc theo minSpending DESC (ngưỡng cao nhất trước).
 * Tier `isActive=false` bị bỏ qua (soft delete giữ FK toàn vẹn nhưng không tham gia recalc).
 *
 * Trả null khi:
 *  - Mảng tiers rỗng (chưa seed)
 *  - Tất cả tiers đều inactive
 *  - totalSpent < minSpending của tier thấp nhất còn active
 */
export function findTierByTotalSpent(
  totalSpent: Prisma.Decimal,
  tiersSortedDesc: CustomerTier[],
): CustomerTier | null {
  for (const tier of tiersSortedDesc) {
    if (!tier.isActive) continue;
    if (totalSpent.greaterThanOrEqualTo(tier.minSpending)) {
      return tier;
    }
  }
  return null;
}
