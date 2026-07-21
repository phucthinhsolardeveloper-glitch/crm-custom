'use client';

import { useCallback } from 'react';
import { DateTimeRangePicker } from '@/components/shared/date-time-range-picker';
import type { DatePresetKey } from '@/lib/datetime-utc7';
import type { DashboardRange } from './constants';

interface DashboardHeaderProps {
  isAdmin: boolean;
  range: DashboardRange;
  onRangeChange: (next: DashboardRange) => void;
  title?: string;
  subtitle?: string;
  /** Bật gradient sky→cyan cho title (dùng cho dashboard chính). */
  gradient?: boolean;
}

/**
 * Header cho 4 trang /dashboard, /dashboard/revenue, /dashboard/customers, /dashboard/employees.
 * Dùng DateTimeRangePicker chung với /leads - có preset (Hôm nay/Hôm qua/7d/30d/Tháng này/Tháng trước/Tùy chọn)
 * + chọn giờ phút 24h UTC+7.
 */
export function DashboardHeader({ isAdmin, range, onRangeChange, title, subtitle, gradient }: DashboardHeaderProps) {
  const handleApply = useCallback(
    (next: { from: string; to: string; preset: DatePresetKey }) => {
      onRangeChange({ from: next.from, to: next.to, preset: next.preset });
    },
    [onRangeChange],
  );

  const titleCls = gradient
    ? 'text-2xl sm:text-3xl font-bold bg-gradient-to-r from-sky-500 to-cyan-500 bg-clip-text text-transparent'
    : 'text-2xl font-bold text-slate-900';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className={titleCls}>{title || 'Tổng quát'}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {subtitle || (isAdmin ? 'Tổng quan hệ thống CRM-Custom' : 'Thống kê cá nhân')}
        </p>
      </div>

      <DateTimeRangePicker
        from={range.from}
        to={range.to}
        preset={range.preset}
        onApply={handleApply}
      />
    </div>
  );
}
