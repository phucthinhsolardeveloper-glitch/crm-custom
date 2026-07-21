'use client';

import { KpiCard, type KpiMiniBar } from './widgets/kpi-card';
import {
  type DashboardStatsData, type NewVsReturningData, COLORS,
  fmtVNDShort, fmtNum, fmtPct, safeDiv,
} from './constants';

interface DashboardKpiSectionProps {
  stats: DashboardStatsData | null;
  prevStats: DashboardStatsData | null;
  newVsReturning: NewVsReturningData | null;
  loading: boolean;
}

/** Tỷ lệ CV (% chuyển đổi) = converted / newLeads (cohort) */
function computeConvRate(s: DashboardStatsData | null): number | null {
  if (!s) return null;
  const r = safeDiv(s.converted ?? 0, s.newLeads ?? 0);
  return r == null ? null : r * 100;
}

/** Build mini-bar cho card Leads: tỉ lệ Khách hàng mới / Khách hàng cũ trong lead pool theo SĐT */
function buildLeadMiniBar(nvr: NewVsReturningData | null): KpiMiniBar | undefined {
  if (!nvr || nvr.newLeads.total === 0) return undefined;
  const { total, fromNew, fromReturning } = nvr.newLeads;
  const ratio = (fromNew / total) * 100;
  const pctNew = Math.round(ratio);
  return {
    ratio,
    tooltipLines: [
      `Tổng số: ${fmtNum(total)} lead`,
      `Khách hàng mới: ${fmtNum(fromNew)} lead (${pctNew}%)`,
      `Khách hàng cũ: ${fmtNum(fromReturning)} lead (${100 - pctNew}%)`,
    ],
  };
}

/** Build mini-bar cho card Doanh thu: tỉ lệ revenue từ Khách hàng mới / Khách hàng cũ */
function buildRevenueMiniBar(nvr: NewVsReturningData | null): KpiMiniBar | undefined {
  if (!nvr || nvr.revenue.total === 0) return undefined;
  const { total, fromNew, fromReturning } = nvr.revenue;
  const { fromNew: custNew, fromReturning: custRet } = nvr.customers;
  const ratio = (fromNew / total) * 100;
  const pctNew = Math.round(ratio);
  return {
    ratio,
    tooltipLines: [
      `Khách hàng mới: ${fmtNum(custNew)} khách hàng - ${fmtVNDShort(fromNew)} (${pctNew}%)`,
      `Khách hàng cũ: ${fmtNum(custRet)} khách hàng - ${fmtVNDShort(fromReturning)} (${100 - pctNew}%)`,
    ],
  };
}

/**
 * 5 KPI cards: Leads / Tỷ lệ CV / KH mới / Đơn hàng / Doanh thu (gradient highlight).
 * Mini-bar trong Lead + Doanh thu hiển thị tỉ lệ KH mới vs KH cũ - hover xem tooltip.
 */
export function DashboardKpiSection({ stats, prevStats, newVsReturning, loading }: DashboardKpiSectionProps) {
  if (loading) {
    return (
      <div className="kpi-row flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[110px] min-w-[180px] shrink-0 animate-pulse rounded-xl bg-slate-100 sm:min-w-0 sm:shrink" />
        ))}
      </div>
    );
  }

  const convRate = computeConvRate(stats);
  const prevConvRate = computeConvRate(prevStats);
  const leadMiniBar = buildLeadMiniBar(newVsReturning);
  const revenueMiniBar = buildRevenueMiniBar(newVsReturning);

  const cards = [
    {
      key: 'leads',
      title: 'Leads mới',
      value: fmtNum(stats?.newLeads),
      subtitle: 'Trong kỳ',
      accentColor: COLORS.primary,
      bgColor: '#e0f2fe',
      currentValue: stats?.newLeads,
      previousValue: prevStats?.newLeads,
      miniBar: leadMiniBar,
      infoTooltip: 'Số lead được tạo mới trong kỳ đã chọn, tính mọi nguồn: form, CSV import, API, nhập tay.',
    },
    {
      key: 'conv-rate',
      title: 'Tỷ lệ Convert',
      value: fmtPct(convRate),
      subtitle: 'Convert / Leads mới',
      accentColor: COLORS.success,
      bgColor: COLORS.successLight,
      currentValue: convRate,
      previousValue: prevConvRate,
      deltaFormat: 'pp' as const,
      infoTooltip: 'Phần trăm lead trong kỳ đã chuyển thành đơn hàng = số lead CONVERTED chia cho số lead mới trong kỳ.',
    },
    {
      key: 'new-customers',
      title: 'Khách mới',
      value: fmtNum(stats?.newCustomers),
      subtitle: 'Trong kỳ',
      accentColor: COLORS.purple,
      bgColor: COLORS.purpleLight,
      currentValue: stats?.newCustomers,
      previousValue: prevStats?.newCustomers,
      infoTooltip: 'Số khách hàng MỚI phát sinh trong kỳ - lead lần đầu chuyển thành khách (có đơn đầu tiên).',
    },
    {
      key: 'orders',
      title: 'Đơn hàng',
      value: fmtNum(stats?.totalOrders),
      subtitle: 'Trong kỳ',
      accentColor: COLORS.teal,
      bgColor: COLORS.tealLight,
      currentValue: stats?.totalOrders,
      previousValue: prevStats?.totalOrders,
      infoTooltip: 'Tổng số đơn hàng tạo trong kỳ, gồm cả đơn của khách mới lẫn khách cũ mua lại / nâng cấp.',
    },
    {
      key: 'revenue',
      title: 'Doanh thu',
      value: stats ? fmtVNDShort(stats.revenue) : '--',
      subtitle: 'Đã xác nhận',
      accentColor: COLORS.primary,
      bgColor: '#e0f2fe',
      currentValue: stats?.revenue,
      previousValue: prevStats?.revenue,
      variant: 'gradient' as const,
      miniBar: revenueMiniBar,
      infoTooltip: 'Tổng tiền ĐÃ XÁC NHẬN (payment verified) trong kỳ - không tính đơn chưa thu hoặc đang chờ verify.',
    },
  ];

  return (
    // stagger-children: 5 card xuat hien lan luot lech 50ms (globals.css)
    <div className="kpi-row stagger-children flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:grid-cols-5">
      {cards.map(card => (
        <div key={card.key} className="min-w-[180px] shrink-0 snap-center sm:min-w-0 sm:shrink">
          <KpiCard {...card} />
        </div>
      ))}
    </div>
  );
}
