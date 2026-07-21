'use client';

import { KpiCard } from './kpi-card';
import { fmtVNDShort, fmtNum, fmtPct, COLORS, type KpiOverview } from '../constants';

interface KpiCardsRowProps {
  data: KpiOverview | null;
  loading: boolean;
}

export function KpiCardsRow({ data, loading }: KpiCardsRowProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="" value="" trendPct={null} spark={[]} loading />
        <KpiCard label="" value="" trendPct={null} spark={[]} loading />
        <KpiCard label="" value="" trendPct={null} spark={[]} loading />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        label="Doanh thu"
        value={fmtVNDShort(data.totalRevenue.current)}
        trendPct={data.totalRevenue.trendPct}
        spark={data.spark.revenue}
        color={COLORS.primary}
        tooltip="Doanh thu công ty = tổng thanh toán VERIFIED + REJECTED. Doanh số KPI của sale chỉ tính VERIFIED."
      />
      <KpiCard
        label="Đơn chốt"
        value={fmtNum(data.totalOrders.current)}
        trendPct={data.totalOrders.trendPct}
        spark={data.spark.orders}
        color={COLORS.teal}
      />
      <KpiCard
        label="Tỷ lệ chuyển đổi"
        value={fmtPct(data.convRate.current, 1)}
        trendPct={data.convRate.trendPct}
        spark={data.spark.convRate}
        color={COLORS.purple}
      />
    </div>
  );
}
