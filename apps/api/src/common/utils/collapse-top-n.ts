import type { TopNItem, TopNResponse } from '@crm/types';

/** Input row trước khi collapse - phải đã sort DESC theo revenue ở DB level. */
export interface CollapseTopNInput {
  id: string | null;
  name: string;
  revenue: number;
  orderCount?: number;
}

/**
 * Collapse rows ngoài Top N vào item "Khác". Input phải đã sort DESC theo revenue (DB ORDER BY).
 * Trả response chuẩn cho mọi endpoint by-X (payment-type, format, group, bank, installment, tier).
 *
 * Edge cases:
 * - rows.length === 0 hoặc total === 0 → response rỗng (items=[], other=null)
 * - rows.length <= topN → trả nguyên, other=null
 * - rows.length > topN → top N + 1 row "Khác" tổng hợp
 *
 * Tie-breaking ở boundary: dựa vào input order (DB ORDER BY revenue DESC, name ASC).
 * Cố ý không re-sort trong JS - tin cậy DB sort để consistent giữa các call.
 */
export function collapseTopN(
  rows: CollapseTopNInput[],
  topN = 5,
  otherLabel = 'Khác',
): TopNResponse {
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  if (rows.length === 0 || total === 0) {
    return { items: [], other: null, total: 0, totalGroups: 0 };
  }

  const withPct: TopNItem[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    revenue: r.revenue,
    orderCount: r.orderCount,
    pct: Math.round((r.revenue / total) * 1000) / 10,
  }));

  if (withPct.length <= topN) {
    return { items: withPct, other: null, total, totalGroups: withPct.length };
  }

  const top = withPct.slice(0, topN);
  const rest = withPct.slice(topN);
  const otherRevenue = rest.reduce((sum, r) => sum + r.revenue, 0);
  const otherCount = rest.reduce((sum, r) => sum + (r.orderCount ?? 0), 0);
  const otherPct = Math.round((otherRevenue / total) * 1000) / 10;

  return {
    items: [
      ...top,
      {
        id: null,
        name: otherLabel,
        revenue: otherRevenue,
        orderCount: otherCount || undefined,
        pct: otherPct,
      },
    ],
    other: {
      count: rest.length,
      revenue: otherRevenue,
      pct: otherPct,
    },
    total,
    totalGroups: withPct.length,
  };
}
