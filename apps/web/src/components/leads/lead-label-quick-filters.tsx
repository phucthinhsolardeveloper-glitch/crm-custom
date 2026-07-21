'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useLeadFilterPending } from '@/components/leads/lead-filter-pending-context';
import { useKhoBaseParams } from '@/components/leads/kho-base-params-context';
import { mergeKhoParams } from '@/components/leads/kho-config';
import { localToUTC } from '@/lib/datetime-utc7';

interface LabelCount {
  labelId: string;
  name: string;
  color: string;
  textColor: string;
  count: number;
}

interface LabelCountsResponse {
  total: number;
  noLabelCount: number;
  duplicateLeadCount: number;  // số lead có SĐT trùng (trong phạm vi filter hiện tại)
  duplicatePhoneCount: number; // số SĐT khác nhau bị trùng
  counts: LabelCount[];
}

/**
 * Quick-filter chips by lead label, shown above the lead table.
 * - Fetches counts via unified `/leads/label-counts` - forwards all URL filters (status, assignment, ...).
 * - Click chip → set ?labelId=X in URL (stack với filter khác).
 * - "Tất cả" chip clears labelId.
 * - Active chip highlighted ring + opacity.
 *
 * Scope cũ (my/pool-new/pool-zoom/floating) giờ biểu diễn qua filter combo
 * (vd kho-mới = ?status=POOL&assignment=unassigned). Component không cần prop scope nữa.
 */
export function LeadLabelQuickFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [data, setData] = useState<LabelCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active label from URL
  const activeLabelId = searchParams.get('labelId');

  // Pending date + tín hiệu refetch counts (rung sau mỗi bulk-action ở LeadsTable).
  const { pending: pendingDate, clearPending, labelCountsVersion } = useLeadFilterPending();

  // Trang kho: merge điều kiện scope kho (fix cứng trong code) vào query count.
  const khoBaseParams = useKhoBaseParams();

  // Build query string of all params except labelId - used to fetch counts
  // that respect other active filters (source, status, assignment, date, etc).
  const queryWithoutLabel = useMemo(() => {
    const params = mergeKhoParams(new URLSearchParams(searchParams.toString()), khoBaseParams);
    params.delete('labelId');
    params.delete('cursor'); // pagination cursor không ảnh hưởng count
    return params.toString();
  }, [searchParams, khoBaseParams]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = queryWithoutLabel ? `?${queryWithoutLabel}` : '';
    api
      .get<{ data: LabelCountsResponse }>(`/leads/label-counts${qs}`)
      .then((res) => setData(res.data))
      .catch((err) => {
        setData(null);
        setError(err?.message || 'Không tải được nhãn');
      })
      .finally(() => setLoading(false));
    // labelCountsVersion: bump từ bulk-action -> refetch counts ngay (không chờ đổi URL).
  }, [queryWithoutLabel, labelCountsVersion]);

  function applyFilter(labelId: string | null) {
    const params = new URLSearchParams(searchParams.toString());

    // Nếu filter bar có pending date thay đổi -> apply LUÔN cùng label
    // (chip click = ngầm bấm "Lọc" + set labelId). Wireframe v4 mục 5 + state machine.
    if (pendingDate) {
      // Clear all 4 date params trước, set lại theo mode
      params.delete('dateFrom'); params.delete('dateTo');
      params.delete('assignedFrom'); params.delete('assignedTo');
      if (pendingDate.mode === 'createdAt') {
        if (pendingDate.from) params.set('dateFrom', localToUTC(pendingDate.from));
        if (pendingDate.to) params.set('dateTo', localToUTC(pendingDate.to));
      } else {
        if (pendingDate.from) params.set('assignedFrom', localToUTC(pendingDate.from));
        if (pendingDate.to) params.set('assignedTo', localToUTC(pendingDate.to));
      }
      clearPending();
    }

    if (labelId) params.set('labelId', labelId);
    else params.delete('labelId');
    params.delete('cursor');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (loading && !data) {
    return <div className="flex gap-2 mb-3 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-7 w-24 rounded-full bg-slate-100" />
      ))}
    </div>;
  }

  // Visible diagnostic: tells user/dev why chips don't show (instead of silent return null)
  if (error) {
    return <div className="mb-3 text-xs text-red-500">Lỗi tải nhãn: {error}</div>;
  }

  if (!data || data.counts.length === 0) {
    return <div className="mb-3 text-xs text-slate-400">Chưa có nhãn nào (vào Cài đặt &gt; Nhãn để thêm)</div>;
  }

  const isAllActive = !activeLabelId;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {/* "Tất cả" - clears labelId */}
      <button
        type="button"
        onClick={() => applyFilter(null)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all',
          'bg-slate-700 text-white',
          isAllActive ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-70 hover:opacity-100'
        )}
      >
        <span>Tất cả</span>
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] tabular-nums">{data.total}</span>
      </button>

      {/* Badge tổng trùng - chỉ hiện khi đang bật filter "lọc trùng" (duplicatesOnly=true) và có trùng */}
      {searchParams.get('duplicatesOnly') === 'true' && data.duplicateLeadCount > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 tabular-nums"
          title="Số lead có SĐT trùng / Số SĐT khác nhau bị trùng"
        >
          ⚠ {data.duplicateLeadCount} lead trùng · {data.duplicatePhoneCount} SĐT
        </span>
      )}

      {/* Per-label chips */}
      {data.counts.map((l) => {
        const isActive = activeLabelId === l.labelId;
        return (
          <button
            key={l.labelId}
            type="button"
            onClick={() => applyFilter(l.labelId)}
            style={{ backgroundColor: l.color, color: l.textColor }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all',
              isActive ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-70 hover:opacity-100'
            )}
          >
            <span>{l.name}</span>
            <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] tabular-nums">{l.count}</span>
          </button>
        );
      })}

      {/* Loading hint when refetching after filter change */}
      {loading && <span className="text-xs text-slate-400 ml-1">đang cập nhật...</span>}
    </div>
  );
}
