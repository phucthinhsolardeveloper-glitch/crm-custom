'use client';

import { Filter, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeadFilterApplyButtonProps {
  pendingCount: number;
  loading?: boolean;
  onApply: () => void;
}

/**
 * Nút "Lọc" - chỉ hiển thị khi có pending filter changes (chưa apply lên URL).
 *
 * Hành vi:
 * - pendingCount=0: render `null` (ẩn hoàn toàn) -> user biết khi nào CẦN bấm.
 * - pendingCount>0: hiện với hiệu ứng pulse + glow + bounce (CSS class `filter-apply-pulse`
 *   định nghĩa trong globals.css) + counter "(n)".
 * - loading=true: disable + spinner thay icon Filter.
 *
 * Lý do tách component: logic visibility + animation độc lập, dễ test + tái sử dụng nếu
 * sau này có filter bar khác (vd /customers, /orders).
 */
export function LeadFilterApplyButton({ pendingCount, loading = false, onApply }: LeadFilterApplyButtonProps) {
  if (pendingCount === 0) return null;

  return (
    <button
      type="button"
      onClick={onApply}
      disabled={loading}
      className={cn(
        'filter-apply-pulse',
        'inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm transition-opacity',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      )}
      title={`Bấm để áp dụng ${pendingCount} thay đổi filter`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Filter className="h-4 w-4" />
      )}
      Lọc
      <span className="ml-0.5 rounded-full bg-white/30 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
        {pendingCount}
      </span>
    </button>
  );
}
