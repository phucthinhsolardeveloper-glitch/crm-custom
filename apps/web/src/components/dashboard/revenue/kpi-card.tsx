'use client';

import { Info } from 'lucide-react';
import { Sparkline } from './sparkline';
import { TrendBadge } from './trend-badge';

interface KpiCardProps {
  label: string;
  value: string;
  trendPct: number | null;
  spark: number[];
  color?: string;
  loading?: boolean;
  /** Tooltip hiển thị khi hover icon Info - giải thích công thức tính. */
  tooltip?: string;
}

export function KpiCard({ label, value, trendPct, spark, color = '#0ea5e9', loading, tooltip }: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-8 w-32 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-16 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
            {tooltip && (
              <span title={tooltip} className="cursor-help text-slate-300 hover:text-sky-500">
                <Info className="h-3.5 w-3.5" />
              </span>
            )}
          </p>
          <p
            className="mt-2 truncate text-2xl font-bold text-slate-900 lg:text-[28px]"
            title={value}
          >
            {value}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <TrendBadge trendPct={trendPct} />
            <span className="text-[11px] text-slate-400">so kỳ trước</span>
          </div>
        </div>
        <Sparkline data={spark} color={color} height={40} width={80} />
      </div>
    </div>
  );
}
