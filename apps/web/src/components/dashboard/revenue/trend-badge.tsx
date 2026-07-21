'use client';

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface TrendBadgeProps {
  trendPct: number | null;
  size?: 'sm' | 'md';
  invert?: boolean;
}

/**
 * Hiển thị trend % vs kỳ trước.
 * - trendPct=null (previous=0) -> "-" (slate)
 * - >0 -> emerald up
 * - <0 -> rose down
 * - =0 -> slate flat
 * invert=true để dùng cho metric "thấp = tốt" (ví dụ tỷ lệ rớt).
 */
export function TrendBadge({ trendPct, size = 'sm', invert = false }: TrendBadgeProps) {
  if (trendPct === null || trendPct === undefined) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
        <Minus className="h-3 w-3" />
        <span>--</span>
      </span>
    );
  }

  const isUp = trendPct > 0;
  const isDown = trendPct < 0;
  const isFlat = trendPct === 0;
  const good = invert ? isDown : isUp;
  const bad = invert ? isUp : isDown;

  const cls = isFlat
    ? 'bg-slate-100 text-slate-600'
    : good
      ? 'bg-emerald-50 text-emerald-700'
      : bad
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-100 text-slate-600';

  const Icon = isFlat ? Minus : isUp ? ArrowUp : ArrowDown;
  const sizeCls = size === 'md' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]';
  const iconCls = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full font-semibold ${cls} ${sizeCls}`}>
      <Icon className={iconCls} />
      <span>{Math.abs(trendPct).toFixed(1)}%</span>
    </span>
  );
}
