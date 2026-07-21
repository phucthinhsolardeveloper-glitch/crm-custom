'use client';

import { ChartCard } from '../widgets/chart-card';
import { TrendBadge } from './trend-badge';
import { fmtVNDShort, fmtNum, type PodiumItem } from '../constants';

interface PodiumTop3Props {
  data: PodiumItem[];
  loading: boolean;
}

const MEDALS: Record<number, { emoji: string; gradient: string; ring: string; label: string }> = {
  1: { emoji: '🥇', gradient: 'from-amber-400 to-amber-600', ring: 'ring-amber-300', label: 'Vàng' },
  2: { emoji: '🥈', gradient: 'from-slate-300 to-slate-500', ring: 'ring-slate-300', label: 'Bạc' },
  3: { emoji: '🥉', gradient: 'from-orange-400 to-orange-600', ring: 'ring-orange-300', label: 'Đồng' },
};

function PodiumCard({ item }: { item: PodiumItem }) {
  const medal = MEDALS[item.rank] ?? MEDALS[3];
  const isFirst = item.rank === 1;
  const wrapperCls = isFirst
    ? 'relative flex flex-col items-center rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-white p-6 shadow-lg lg:-translate-y-3 lg:scale-105'
    : 'relative flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';

  const initials = item.name
    .split(' ')
    .slice(-2)
    .map(s => s[0])
    .join('')
    .toUpperCase();

  return (
    <div className={wrapperCls}>
      <div className="text-4xl">{medal.emoji}</div>
      <div
        className={`mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${medal.gradient} text-lg font-bold text-white ring-4 ${medal.ring}`}
      >
        {initials}
      </div>
      <h3 className="mt-3 truncate text-center text-base font-bold text-slate-900" title={item.name}>
        {item.name}
      </h3>
      <p className="truncate text-xs text-slate-500">{item.deptName}</p>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-400">Doanh số</p>
      <p className="text-2xl font-bold tabular-nums text-slate-900">
        {fmtVNDShort(item.revenue)}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <TrendBadge trendPct={item.trendPctVsPrev} size="sm" />
        <span className="text-[11px] text-slate-400">so kỳ trước</span>
      </div>

      <div className="mt-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        {fmtNum(item.ordersCount)} đơn
      </div>
    </div>
  );
}

export function PodiumTop3({ data, loading }: PodiumTop3Props) {
  if (loading) {
    return (
      <ChartCard title="Top 3 nhân viên xuất sắc">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[280px] animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </ChartCard>
    );
  }

  if (data.length === 0) {
    return (
      <ChartCard title="Top 3 nhân viên xuất sắc">
        <p className="py-12 text-center text-sm text-slate-400">Chưa có doanh thu trong kỳ</p>
      </ChartCard>
    );
  }

  // Reorder: rank 2, 1, 3 cho podium effect đẹp hơn khi desktop
  const sorted = [...data].sort((a, b) => a.rank - b.rank);
  const ordered = sorted.length === 3
    ? [sorted[1], sorted[0], sorted[2]]
    : sorted;

  return (
    <ChartCard title="Top 3 nhân viên xuất sắc">
      <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3 md:items-end">
        {ordered.map(item => (
          <PodiumCard key={item.userId} item={item} />
        ))}
      </div>
    </ChartCard>
  );
}
