'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X, ChevronDown, ChevronUp, HelpCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadFilterDatePicker } from '@/components/leads/lead-filter-date-picker';
import { LeadFilterApplyButton } from '@/components/leads/lead-filter-apply-button';
import { LeadFilterMobileSheet } from '@/components/leads/lead-filter-mobile-sheet';
import { FilterSearchableSelect } from '@/components/leads/filter-searchable-select';
import {
  useLeadFilterPending,
  type LeadTimeFilterMode,
} from '@/components/leads/lead-filter-pending-context';
import { localToUTC, utcToLocal, type DatePresetKey } from '@/lib/datetime-utc7';
import { useIsMobile } from '@/hooks/use-is-mobile';

// Chip "Chọn kho" cho USER role - 2 lựa chọn map sang status filter:
//   POOL → kho phòng ban (BE: status=POOL + dept=user.dept + assignedUserId=null)
//   FLOATING → kho thả nổi (BE: status=FLOATING)
// MANAGER+ ẩn filter này (xem hideStatus prop) vì họ thấy toàn bộ data.
const POOL_OPTIONS = [
  { value: 'POOL', label: 'Kho phòng ban' },
  { value: 'FLOATING', label: 'Kho thả nổi' },
];
const POOL_VALUES = new Set(POOL_OPTIONS.map((o) => o.value));

const ASSIGNMENT_OPTIONS = [
  { value: 'unassigned', label: 'Chưa phân' },
  { value: 'dept', label: 'Đã phân phòng ban' },
  { value: 'user', label: 'Đã phân sale' },
];

// Dropdown sắp xếp: mỗi option gộp cả cột (sortBy) + hướng (sortDir) thành 1 value "field:dir".
// Value phải khớp whitelist LEAD_SORT_FIELDS ở backend (lead-list-query.dto.ts).
// Option đầu (createdAt:desc) là default -> khi chọn sẽ xoá sortBy/sortDir khỏi URL cho gọn.
export const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Ngày tạo (mới nhất)' },
  { value: 'createdAt:asc', label: 'Ngày tạo (cũ nhất)' },
  { value: 'updatedAt:desc', label: 'Ngày cập nhật (mới nhất)' },
  { value: 'updatedAt:asc', label: 'Ngày cập nhật (cũ nhất)' },
  { value: 'lastAssignedAt:desc', label: 'Phân gần nhất' },
  { value: 'lastAssignedAt:asc', label: 'Phân lâu nhất' },
];
const SORT_DEFAULT = 'createdAt:desc';

type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

interface FilterBarProps {
  sources: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  products: { id: string; name: string }[];
  users: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  teams?: { id: string; name: string }[];
  userRole?: UserRole;
  hideStatus?: boolean;
  /** Cờ ẩn filter "Phân bổ" (đã phân/chưa phân). Trang kho scope bằng status
   *  qua baseParams, không đụng assignment - nên filter này bật được an toàn. */
  hideAssignment?: boolean;
  storageKey?: string;
}

/** Full pending state user đang chỉnh (chưa apply lên URL). Export để
 *  mobile sheet (`lead-filter-mobile-sheet.tsx`) chia sẻ type. */
export interface PendingFilters {
  statuses: string[];
  assignment: string;
  // Filter đa chọn (multi-select): mỗi field là mảng id. Mảng rỗng = không lọc.
  sourceId: string[];
  groupId: string[];
  productId: string[];
  departmentId: string[];
  teamId: string[];
  assignedUserId: string[];
  labelId: string[];
  hasOrder: string;
  duplicatesOnly: string;
  nonDuplicatesOnly: string;
  // Date filter
  timeMode: LeadTimeFilterMode;
  preset: DatePresetKey;
  dateFrom: string; // local UTC+7 string
  dateTo: string;
}

const DEFAULT_STORAGE_KEY = 'crm_lead_filters';
const TIME_MODE_STORAGE_KEY = 'crm_lead_time_filter_mode';

/**
 * Filter bar cho trang /leads (manual-apply pattern).
 *
 * UX flow:
 * 1. User chỉnh bất kỳ filter (status, assignment, date, preset, ...) -> local pending state.
 * 2. Nút "Lọc" pulse + counter = số thay đổi pending. (xem lead-filter-apply-button.tsx)
 * 3. User bấm "Lọc" -> push URL params -> RSC fetch lại -> bảng update.
 * 4. User click chip label (lead-label-quick-filters.tsx) cũng apply LUÔN pending date cùng.
 * 5. "Xóa lọc" reset cả pending + URL.
 *
 * Khác bản cũ:
 * - Bỏ search input (top nav đã có search global).
 * - Date filter ra NGOÀI panel, luôn hiển thị, có giờ/phút UTC+7 + preset.
 * - Filter chỉ apply khi bấm nút Lọc, KHÔNG auto trên mỗi onChange.
 * - Counter "Bộ lọc(n)" đếm filter ĐÃ apply (URL), "Lọc(n)" đếm pending.
 * - Toggle ngày tạo/ngày phân mutual exclusive: ẩn param còn lại khi apply.
 *
 */
export function LeadListAdvancedFilterBar({
  sources, groups, products, users, departments, labels,
  teams = [], userRole,
  hideStatus = false, hideAssignment = false, storageKey,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const isMobile = useIsMobile();
  const STORAGE_KEY = storageKey ?? DEFAULT_STORAGE_KEY;
  const isManagerPlus = userRole === 'MANAGER' || userRole === 'SUPER_ADMIN';

  const { setPending: setSharedPending, clearPending } = useLeadFilterPending();

  // Parse URL -> applied state (snapshot).
  // Khi filter "Chọn kho" hiển thị (!hideStatus), strip status không thuộc whitelist
  // POOL/FLOATING - tránh chip cũ (ASSIGNED/IN_PROGRESS/...) còn sót từ localStorage cũ.
  const applied = useMemo<PendingFilters>(() => {
    const hasAssignedFilter = !!(searchParams.get('assignedFrom') || searchParams.get('assignedTo'));
    const rawStatuses = searchParams.getAll('status');
    const statuses = hideStatus ? rawStatuses : rawStatuses.filter((s) => POOL_VALUES.has(s));
    return {
      statuses,
      assignment: searchParams.get('assignment') || '',
      // Multi-select: đọc tất cả giá trị cùng key (?groupId=a&groupId=b). Tương thích URL cũ single value.
      sourceId: searchParams.getAll('sourceId'),
      groupId: searchParams.getAll('groupId'),
      productId: searchParams.getAll('productId'),
      departmentId: searchParams.getAll('departmentId'),
      teamId: searchParams.getAll('teamId'),
      assignedUserId: searchParams.getAll('assignedUserId'),
      labelId: searchParams.getAll('labelId'),
      hasOrder: searchParams.get('hasOrder') || '',
      duplicatesOnly: searchParams.get('duplicatesOnly') || '',
      nonDuplicatesOnly: searchParams.get('nonDuplicatesOnly') || '',
      timeMode: hasAssignedFilter ? 'assignedAt' : 'createdAt',
      preset: 'custom',
      dateFrom: hasAssignedFilter
        ? utcToLocal(searchParams.get('assignedFrom') || '')
        : utcToLocal(searchParams.get('dateFrom') || ''),
      dateTo: hasAssignedFilter
        ? utcToLocal(searchParams.get('assignedTo') || '')
        : utcToLocal(searchParams.get('dateTo') || ''),
    };
  }, [searchParams, hideStatus]);

  const [pending, setPending] = useState<PendingFilters>(applied);

  // Restore filters from localStorage if URL has no params (first visit / direct link)
  useEffect(() => {
    if (restored) return;
    setRestored(true);
    if (searchParams.toString()) {
      localStorage.setItem(STORAGE_KEY, searchParams.toString());
    } else {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        router.replace(`${pathname}?${saved}`);
      }
    }
  }, [restored, searchParams, pathname, router, STORAGE_KEY]);

  // Khi URL đổi -> sync pending về applied (apply success hoặc back/forward)
  useEffect(() => {
    setPending(applied);
    clearPending();
  }, [applied, clearPending]);

  // Persist time mode preference vào localStorage (restore lần load sau)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(TIME_MODE_STORAGE_KEY) as LeadTimeFilterMode | null;
    if (saved === 'createdAt' || saved === 'assignedAt') {
      // Chỉ override pending mode nếu URL chưa có date filter (vì URL là nguồn chính)
      const hasUrlDate = applied.dateFrom || applied.dateTo;
      if (!hasUrlDate && saved !== pending.timeMode) {
        setPending((p) => ({ ...p, timeMode: saved }));
      }
    }
    // Mount-only effect: restore time mode preference từ localStorage. Không depend
    // applied/pending để tránh re-run loop. Subsequent updates đi qua useEffect[applied] phía dưới.
  }, []);  

  // Update pending date in shared context (cho label chip apply cùng)
  useEffect(() => {
    if (pending.dateFrom || pending.dateTo) {
      setSharedPending({
        mode: pending.timeMode,
        from: pending.dateFrom,
        to: pending.dateTo,
      });
    } else {
      setSharedPending(null);
    }
  }, [pending.timeMode, pending.dateFrom, pending.dateTo, setSharedPending]);

  // Build URL params từ pending state
  const buildParams = useCallback((p: PendingFilters): URLSearchParams => {
    const params = new URLSearchParams();
    p.statuses.forEach((s) => params.append('status', s));
    if (p.assignment) params.set('assignment', p.assignment);
    // Multi-select: append từng giá trị cùng key (?sourceId=a&sourceId=b).
    p.sourceId.forEach((v) => params.append('sourceId', v));
    p.groupId.forEach((v) => params.append('groupId', v));
    p.productId.forEach((v) => params.append('productId', v));
    p.departmentId.forEach((v) => params.append('departmentId', v));
    p.teamId.forEach((v) => params.append('teamId', v));
    p.assignedUserId.forEach((v) => params.append('assignedUserId', v));
    p.labelId.forEach((v) => params.append('labelId', v));
    if (p.hasOrder) params.set('hasOrder', p.hasOrder);
    if (p.duplicatesOnly) params.set('duplicatesOnly', p.duplicatesOnly);
    if (p.nonDuplicatesOnly) params.set('nonDuplicatesOnly', p.nonDuplicatesOnly);
    // Date filter - mutual exclusive theo mode
    if (p.timeMode === 'createdAt') {
      if (p.dateFrom) params.set('dateFrom', localToUTC(p.dateFrom));
      if (p.dateTo) params.set('dateTo', localToUTC(p.dateTo));
    } else {
      if (p.dateFrom) params.set('assignedFrom', localToUTC(p.dateFrom));
      if (p.dateTo) params.set('assignedTo', localToUTC(p.dateTo));
    }
    return params;
  }, []);

  // Diff đếm số filter pending khác applied
  const pendingCount = useMemo(() => {
    let c = 0;
    // Các field mảng (statuses + 7 filter đa chọn): đếm theo độ lệch tập hợp.
    const arrayFields: (keyof PendingFilters)[] = [
      'statuses', 'sourceId', 'groupId', 'productId', 'departmentId',
      'teamId', 'assignedUserId', 'labelId',
    ];
    arrayFields.forEach((k) => {
      const pa = pending[k] as string[];
      const aa = applied[k] as string[];
      if (pa.length !== aa.length || pa.some((s) => !aa.includes(s))) {
        c += Math.max(pa.length, aa.length);
      }
    });
    // Single-value scalars còn lại
    const scalars: (keyof PendingFilters)[] = ['assignment', 'hasOrder', 'duplicatesOnly', 'nonDuplicatesOnly'];
    scalars.forEach((k) => {
      if (pending[k] !== applied[k]) c++;
    });
    // Date filter (group thành 1 counter dù 3 field thay đổi).
    // CHỈ count khi sự thay đổi sẽ thực sự sinh ra URL khác - tức là phải có
    // ít nhất 1 phía (pending hoặc applied) chứa date range.
    // Đổi timeMode không kèm date = pure preference, không tạo URL change ->
    // KHÔNG được tính là pending, nếu không nút "Lọc" sẽ pulse vĩnh viễn
    // (router.push(sameUrl) không trigger re-render -> pending không sync về applied).
    const hasDate = !!(pending.dateFrom || pending.dateTo);
    const hadDate = !!(applied.dateFrom || applied.dateTo);
    if ((hasDate || hadDate) &&
        (pending.timeMode !== applied.timeMode ||
         pending.dateFrom !== applied.dateFrom ||
         pending.dateTo !== applied.dateTo)) {
      c++;
    }
    return c;
  }, [pending, applied]);

  // Counter cho nút [Bộ lọc(n)] = filter ĐÃ apply (URL)
  const appliedCount = useMemo(() => {
    // Mỗi giá trị đã chọn trong các field mảng tính 1 (vd 3 nhóm = 3).
    let c = applied.statuses.length
      + applied.sourceId.length + applied.groupId.length + applied.productId.length
      + applied.departmentId.length + applied.teamId.length
      + applied.assignedUserId.length + applied.labelId.length;
    if (applied.assignment) c++;
    if (applied.hasOrder) c++;
    if (applied.duplicatesOnly) c++;
    if (applied.nonDuplicatesOnly) c++;
    // Date filter applied đếm 1 (dù from+to)
    if (applied.dateFrom || applied.dateTo) c++;
    return c;
  }, [applied]);

  const hasAnyFilter = appliedCount > 0 || pendingCount > 0;

  // Sort hiện tại đọc từ URL (createdAt:desc mặc định khi URL trống).
  // Sort áp dụng NGAY khi chọn (không qua nút Lọc) - giống hành vi click header bảng.
  const currentSort = `${searchParams.get('sortBy') || 'createdAt'}:${searchParams.get('sortDir') || 'desc'}`;
  const changeSort = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const [field, dir] = value.split(':');
    if (value === SORT_DEFAULT) {
      // Default -> xoá param cho URL gọn, backend tự fallback createdAt desc.
      params.delete('sortBy');
      params.delete('sortDir');
    } else {
      params.set('sortBy', field);
      params.set('sortDir', dir);
    }
    params.delete('cursor');
    const qs = params.toString();
    localStorage.setItem(STORAGE_KEY, qs);
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, router, pathname, STORAGE_KEY]);

  // Apply pending -> push URL
  const applyFilters = useCallback(() => {
    const params = buildParams(pending);
    params.delete('cursor');
    // Preserve sort hiện tại: buildParams tạo params mới nên phải copy lại sortBy/sortDir
    // từ URL, nếu không sort sẽ mất mỗi khi user bấm Lọc.
    const sortBy = searchParams.get('sortBy');
    const sortDir = searchParams.get('sortDir');
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);
    const qs = params.toString();
    localStorage.setItem(STORAGE_KEY, qs);
    localStorage.setItem(TIME_MODE_STORAGE_KEY, pending.timeMode);
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [buildParams, pending, router, pathname, STORAGE_KEY, searchParams]);

  // Clear all - reset pending + URL
  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    clearPending();
    router.push(pathname);
  }, [STORAGE_KEY, clearPending, router, pathname]);

  // Helpers cập nhật pending scalar
  const update = <K extends keyof PendingFilters>(key: K, value: PendingFilters[K]) => {
    setPending((p) => ({ ...p, [key]: value }));
  };

  // Toggle status checkbox
  const toggleStatus = (statusValue: string) => {
    setPending((p) => ({
      ...p,
      statuses: p.statuses.includes(statusValue)
        ? p.statuses.filter((s) => s !== statusValue)
        : [...p.statuses, statusValue],
    }));
  };

  // ─── Mobile branch ──────────────────────────────────────────────
  // < 768px → compact bar [🔍 Bộ lọc (n)] + [Xóa lọc] (nếu có). Date filter
  // di chuyển vào sheet (top bar gọn chỉ 1-2 chip). Tap "Bộ lọc" mở sheet.
  if (isMobile) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={(appliedCount > 0 || pendingCount > 0) ? 'default' : 'outline'}
            onClick={() => setMobileSheetOpen(true)}
            className={cn(
              'flex-1 h-10',
              (appliedCount > 0 || pendingCount > 0) &&
                'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md',
            )}
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Bộ lọc
            {(appliedCount > 0 || pendingCount > 0) && (
              <span className="ml-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                {pendingCount > 0 ? pendingCount : appliedCount}
              </span>
            )}
          </Button>
          {hasAnyFilter && (
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-10 px-3">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <LeadFilterMobileSheet
          open={mobileSheetOpen}
          onOpenChange={setMobileSheetOpen}
          pending={pending}
          updateField={update}
          toggleStatus={toggleStatus}
          pendingCount={pendingCount}
          applyFilters={applyFilters}
          clearAll={clearAll}
          currentSort={currentSort}
          onSortChange={changeSort}
          sources={sources}
          groups={groups}
          products={products}
          users={users}
          departments={departments}
          teams={teams}
          labels={labels}
          hideStatus={hideStatus}
          hideAssignment={hideAssignment}
          isManagerPlus={isManagerPlus}
        />
      </div>
    );
  }

  // ─── Desktop render (giữ nguyên) ─────────────────────────────────
  // ml-0.5 sm:ml-1 = cách sidebar 2-4px (LeadsLayoutShell có -m-1 sm:-m-2 cancel main padding,
  // filter card tự khai báo margin-left để KHÔNG dính sát menu).
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1.5 ml-0.5 sm:ml-1">
      {/* Header row: Bộ lọc | Date picker | Apply | Xóa lọc */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={expanded ? 'default' : 'outline'}
          onClick={() => setExpanded(!expanded)}
          className="h-9"
        >
          <Filter className="h-4 w-4 mr-1" />
          Bộ lọc
          {appliedCount > 0 && (
            <span className="ml-1 rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
              {appliedCount}
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
        </Button>

        {/* Date picker luôn visible */}
        <LeadFilterDatePicker
          mode={pending.timeMode}
          onModeChange={(m) => update('timeMode', m)}
          preset={pending.preset}
          onPresetChange={(p) => update('preset', p)}
          from={pending.dateFrom}
          to={pending.dateTo}
          onFromChange={(v) => update('dateFrom', v)}
          onToChange={(v) => update('dateTo', v)}
        />

        {/* Dropdown sắp xếp - luôn visible, áp dụng ngay khi chọn (không qua nút Lọc) */}
        <Select value={currentSort} onValueChange={changeSort}>
          <SelectTrigger className="h-9 text-sm w-auto min-w-[170px] gap-1">
            <span className="text-slate-400 text-xs">Sắp xếp:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Nút Lọc - ẩn khi pendingCount=0, pulse khi có */}
        <LeadFilterApplyButton pendingCount={pendingCount} onApply={applyFilters} />

        {hasAnyFilter && (
          <Button size="sm" variant="ghost" onClick={clearAll} className="h-9">
            <X className="h-4 w-4 mr-1" />Xóa lọc
          </Button>
        )}
      </div>

      {/* Notice vàng khi có pending */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Có <strong>{pendingCount}</strong> thay đổi chưa áp dụng - bấm <strong>Lọc</strong> để xem kết quả.
          </span>
        </div>
      )}

      {/* Expanded panel: status chips + selects */}
      {expanded && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          {/* Toggle lọc trùng / không trùng SĐT - hiện cho mọi role. 2 nút loại trừ lẫn nhau:
              bật nút này tự tắt nút kia (BE cũng ưu tiên duplicatesOnly nếu lỡ gửi cả 2). */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Lọc trùng</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPending((p) => ({
                  ...p,
                  duplicatesOnly: p.duplicatesOnly === 'true' ? '' : 'true',
                  nonDuplicatesOnly: '',
                }))}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  pending.duplicatesOnly === 'true'
                    ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                )}
              >
                {pending.duplicatesOnly === 'true' && <span className="text-[10px]">✓</span>}
                Chỉ hiện lead trùng SĐT
              </button>
              <button
                type="button"
                onClick={() => setPending((p) => ({
                  ...p,
                  nonDuplicatesOnly: p.nonDuplicatesOnly === 'true' ? '' : 'true',
                  duplicatesOnly: '',
                }))}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  pending.nonDuplicatesOnly === 'true'
                    ? 'bg-sky-500 text-white border-sky-500 hover:bg-sky-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                )}
              >
                {pending.nonDuplicatesOnly === 'true' && <span className="text-[10px]">✓</span>}
                Chỉ hiện lead không trùng SĐT
              </button>
            </div>
          </div>

          {/* Chọn kho (USER only) - manager+ ẩn vì họ thấy toàn bộ data */}
          {!hideStatus && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Chọn kho</label>
              <div className="flex flex-wrap gap-1.5">
                {POOL_OPTIONS.map((s) => {
                  const checked = pending.statuses.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleStatus(s.value)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                        checked
                          ? 'bg-sky-500 text-white border-sky-500 hover:bg-sky-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {checked && <span className="text-[10px]">✓</span>}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selects grid */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {isManagerPlus && !hideAssignment && (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Phân bổ</label>
                <Select value={pending.assignment || 'all'} onValueChange={(v) => update('assignment', v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {ASSIGNMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Nguồn</label>
              <FilterSearchableSelect
                value={pending.sourceId}
                onChange={(v) => update('sourceId', v)}
                options={sources.map((s) => ({ value: s.id, label: s.name }))}
                searchPlaceholder="Tìm nguồn..."
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Nhóm</label>
              <FilterSearchableSelect
                value={pending.groupId}
                onChange={(v) => update('groupId', v)}
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
                searchPlaceholder="Tìm nhóm..."
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Sản phẩm</label>
              <FilterSearchableSelect
                value={pending.productId}
                onChange={(v) => update('productId', v)}
                options={products.map((p) => ({ value: p.id, label: p.name }))}
                searchPlaceholder="Tìm sản phẩm..."
              />
            </div>

            {isManagerPlus && (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Phòng ban</label>
                <FilterSearchableSelect
                  value={pending.departmentId}
                  onChange={(v) => update('departmentId', v)}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  searchPlaceholder="Tìm phòng ban..."
                />
              </div>
            )}

            {isManagerPlus && teams.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Nhóm sale</label>
                <FilterSearchableSelect
                  value={pending.teamId}
                  onChange={(v) => update('teamId', v)}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                  searchPlaceholder="Tìm nhóm sale..."
                />
              </div>
            )}

            {isManagerPlus && (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Nhân viên</label>
                <FilterSearchableSelect
                  value={pending.assignedUserId}
                  onChange={(v) => update('assignedUserId', v)}
                  options={users.map((u) => ({ value: u.id, label: u.name }))}
                  searchPlaceholder="Tìm nhân viên..."
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Nhãn</label>
              <FilterSearchableSelect
                value={pending.labelId}
                onChange={(v) => update('labelId', v)}
                options={labels.map((l) => ({ value: l.id, label: l.name, dotColor: l.color }))}
                searchPlaceholder="Tìm nhãn..."
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                Đơn hàng
                <span
                  title="Lọc theo việc lead đã có đơn hàng hay chưa (mọi trạng thái)"
                  className="text-slate-400 hover:text-slate-600 cursor-help"
                >
                  <HelpCircle className="h-3 w-3" />
                </span>
              </label>
              <Select value={pending.hasOrder || 'all'} onValueChange={(v) => update('hasOrder', v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="true">Có đơn hàng</SelectItem>
                  <SelectItem value="false">Chưa có đơn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
