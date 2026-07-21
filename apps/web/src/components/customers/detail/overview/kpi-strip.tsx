import type { CustomerRecord } from '@/types/entities';
import { calcCustomerKpi } from '@/lib/calc-customer-kpi';
import { formatCompactMoney } from '@/lib/utils';
import { KpiCard } from './kpi-card';

// KPI strip 3 cards: Tổng đơn + Doanh thu + Tổng chi tiêu (verified) + hạng.
// Card chi tiêu nhuộm màu theo tier để nổi bật.
export function KpiStrip({ customer }: { customer: CustomerRecord }) {
  const kpi = calcCustomerKpi(customer);
  const revenueValue = kpi.totalRevenue > 0 ? formatCompactMoney(kpi.totalRevenue) : '-';
  const totalSpentNum = Number(customer.totalSpent ?? 0);
  const spentValue = totalSpentNum > 0 ? formatCompactMoney(totalSpentNum) : '-';
  const tier = customer.currentTier;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-3.5">
      <KpiCard
        label="Tổng đơn"
        value={kpi.totalOrders.toString()}
        delta={kpi.ordersThisMonth > 0 ? `+${kpi.ordersThisMonth} /tháng này` : 'Chưa có đơn tháng này'}
      />
      <KpiCard
        label="Doanh thu"
        value={revenueValue}
        delta={kpi.totalRevenue > 0 ? 'Tổng giá trị đơn (VERIFIED + REJECTED)' : undefined}
      />
      <KpiCard
        label="Đã thanh toán (verified)"
        value={spentValue}
        delta={tier ? `Hạng ${tier.name}` : 'Chưa xếp hạng'}
        tone={tier?.color ?? null}
      />
    </div>
  );
}
