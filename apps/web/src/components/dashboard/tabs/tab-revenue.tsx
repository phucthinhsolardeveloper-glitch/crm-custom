'use client';

import dynamic from 'next/dynamic';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, AreaChart,
} from 'recharts';
import { ChartCard } from '../widgets/chart-card';
import { ChartTooltip } from '../widgets/chart-tooltip';
import { COLORS, fmtVND, fmtShort } from '../constants';
import type { RevenueTabData } from '../hooks/use-tab-data';
import { NoteBanner } from '../revenue/note-banner';
import { KpiCardsRow } from '../revenue/kpi-cards-row';
import { DeptComparisonGrid } from '../revenue/dept-comparison-grid';
import { PodiumTop3 } from '../revenue/podium-top-3';
import { FullLeaderboard } from '../revenue/full-leaderboard';

// Pie chart lazy load - tránh bundle bloat
const ProductPieChart = dynamic(
  () => import('../revenue/product-pie-chart').then(m => m.ProductPieChart),
  { ssr: false, loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-slate-100" /> },
);

interface TabRevenueProps {
  data: RevenueTabData | null;
  loading: boolean;
  isAdmin: boolean;
}

function RevenueTrendChart({ trend, loading }: { trend: RevenueTabData['revenueTrend']; loading: boolean }) {
  if (loading) {
    return (
      <ChartCard title="Chi tiết doanh thu theo ngày">
        <div className="h-[300px] animate-pulse rounded-xl bg-slate-100" />
      </ChartCard>
    );
  }
  if (trend.length === 0) {
    return (
      <ChartCard title="Chi tiết doanh thu theo ngày">
        <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu doanh thu trong kỳ</p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Chi tiết doanh thu theo ngày">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={trend}>
          <defs>
            <linearGradient id="revDetailGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
          <Tooltip content={<ChartTooltip valueFormatter={fmtVND} />} />
          <Area
            type="monotone" dataKey="revenue" stroke={COLORS.primary} strokeWidth={2.5}
            fill="url(#revDetailGrad)" name="Doanh thu" dot={false}
            activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TabRevenue({ data, loading, isAdmin }: TabRevenueProps) {
  // Render skeleton tổng quát khi chưa có data
  if (!data) {
    return (
      <div className="space-y-6">
        {isAdmin && <NoteBanner />}
        <KpiCardsRow data={null} loading />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueTrendChart trend={[]} loading />
          </div>
          <ProductPieChart data={[]} loading />
        </div>
      </div>
    );
  }

  // User thường: chỉ xem revenue trend cá nhân
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <RevenueTrendChart trend={data.revenueTrend} loading={loading} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <NoteBanner />

      <KpiCardsRow data={data.overview} loading={loading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrendChart trend={data.revenueTrend} loading={loading} />
        </div>
        <ProductPieChart data={data.byProduct} loading={loading} />
      </div>

      <DeptComparisonGrid data={data.deptComparison} loading={loading} />

      <PodiumTop3 data={data.podium} loading={loading} />

      <FullLeaderboard data={data.leaderboard} loading={loading} />
    </div>
  );
}
