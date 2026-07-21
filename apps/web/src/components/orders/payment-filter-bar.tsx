'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Search, X, Filter, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { DateTimeRangePicker } from '@/components/shared/date-time-range-picker';
import { FilterSearchableSelect } from '@/components/leads/filter-searchable-select';
import type { DatePresetKey } from '@/lib/datetime-utc7';

// Payment statuses - 5 trang thai.
const PAYMENT_STATUSES = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'VERIFIED', label: 'Đã xác nhận' },
  { value: 'REJECTED', label: 'Sai thông tin' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
];

interface NamedItem { id: string; name: string }

interface Props {
  paymentTypes: NamedItem[];
  products: NamedItem[];
  productGroups: NamedItem[];
  users: NamedItem[];          // creators - rỗng nếu không phải MANAGER+
  teams: NamedItem[];          // nhóm sale - rỗng nếu không phải MANAGER+
  isManagerPlus?: boolean;     // ẩn select "Người tạo" + "Nhóm sale" với USER
}

/** Pending state user đang chỉnh (chưa apply lên URL).
 *  Các field đa chọn là mảng id - mảng rỗng = không lọc. */
interface PendingFilters {
  search: string;
  status: string[];
  paymentTypeId: string[];
  productId: string[];
  productGroupId: string[];
  createdBy: string[];
  teamId: string[];
  dateFrom: string;
  dateTo: string;
}

const STORAGE_KEY = 'crm_order_filters';

/**
 * Filter bar cho trang /orders (payment-centric) - manual-apply pattern.
 *
 * UX flow (giống /leads):
 * 1. User chỉnh filter (search/status/product/...) -> local pending state.
 * 2. Nút "Lọc(n)" pulse + notice vàng đếm số thay đổi chưa apply.
 * 3. Bấm "Lọc" (hoặc Enter ở ô search) -> push URL params -> RSC fetch lại.
 * 4. "Xóa lọc" reset cả pending + URL + localStorage.
 */
export function PaymentFilterBar({ paymentTypes, products, productGroups, users, teams, isManagerPlus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePresetKey>('custom');

  // Parse URL -> applied snapshot.
  const applied = useMemo<PendingFilters>(() => ({
    search: searchParams.get('search') ?? '',
    // Multi-select: đọc tất cả giá trị cùng key (?status=A&status=B). Tương thích URL cũ single value.
    status: searchParams.getAll('status'),
    paymentTypeId: searchParams.getAll('paymentTypeId'),
    productId: searchParams.getAll('productId'),
    productGroupId: searchParams.getAll('productGroupId'),
    createdBy: searchParams.getAll('createdBy'),
    teamId: searchParams.getAll('teamId'),
    dateFrom: searchParams.get('dateFrom') ?? '',
    dateTo: searchParams.get('dateTo') ?? '',
  }), [searchParams]);

  const [pending, setPending] = useState<PendingFilters>(applied);

  // Restore từ localStorage khi URL trống (first visit / direct link).
  useEffect(() => {
    if (restored) return;
    setRestored(true);
    if (searchParams.toString()) {
      localStorage.setItem(STORAGE_KEY, searchParams.toString());
    } else {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) router.replace(`${pathname}?${saved}`);
    }
  }, [restored, searchParams, pathname, router]);

  // Sync pending về applied khi URL đổi (apply success / back-forward).
  useEffect(() => { setPending(applied); }, [applied]);

  const update = <K extends keyof PendingFilters>(key: K, value: PendingFilters[K]) => {
    setPending((p) => ({ ...p, [key]: value }));
  };

  const buildParams = useCallback((p: PendingFilters): URLSearchParams => {
    const params = new URLSearchParams();
    if (p.search.trim()) params.set('search', p.search.trim());
    p.status.forEach((v) => params.append('status', v));
    p.paymentTypeId.forEach((v) => params.append('paymentTypeId', v));
    p.productId.forEach((v) => params.append('productId', v));
    p.productGroupId.forEach((v) => params.append('productGroupId', v));
    p.createdBy.forEach((v) => params.append('createdBy', v));
    p.teamId.forEach((v) => params.append('teamId', v));
    if (p.dateFrom) params.set('dateFrom', p.dateFrom);
    if (p.dateTo) params.set('dateTo', p.dateTo);
    return params;
  }, []);

  const ARRAY_KEYS: (keyof PendingFilters)[] = ['status', 'paymentTypeId', 'productId', 'productGroupId', 'createdBy', 'teamId'];

  // Đếm số thay đổi pending khác applied.
  const pendingCount = useMemo(() => {
    let c = 0;
    if (pending.search !== applied.search) c++;
    ARRAY_KEYS.forEach((k) => {
      const a = pending[k] as string[], b = applied[k] as string[];
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) c++;
    });
    if (pending.dateFrom !== applied.dateFrom || pending.dateTo !== applied.dateTo) c++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, applied]);

  // Đếm filter ĐÃ apply (URL) cho badge nút "Bộ lọc".
  const appliedCount = useMemo(() => {
    let c = 0;
    if (applied.search) c++;
    ARRAY_KEYS.forEach((k) => { if ((applied[k] as string[]).length) c++; });
    if (applied.dateFrom || applied.dateTo) c++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const hasAnyFilter = appliedCount > 0 || pendingCount > 0;

  const applyFilters = useCallback(() => {
    const params = buildParams(pending);
    params.delete('cursor');
    params.delete('page'); // reset về trang 1
    const qs = params.toString();
    localStorage.setItem(STORAGE_KEY, qs);
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [buildParams, pending, router, pathname]);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    router.push(pathname);
  }, [router, pathname]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      {/* Hàng trên: search + toggle + date + Lọc + Xóa */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); applyFilters(); }}
          className="relative flex-1 min-w-[200px]"
        >
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={pending.search}
            onChange={(e) => update('search', e.target.value)}
            placeholder="Tìm nội dung CK, tên khách..."
            className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </form>

        <Button size="sm" variant={expanded ? 'default' : 'outline'} onClick={() => setExpanded(!expanded)} className="h-9">
          <Filter className="h-4 w-4 mr-1" />
          Bộ lọc
          {appliedCount > 0 && (
            <span className="ml-1 rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">{appliedCount}</span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
        </Button>

        <DateTimeRangePicker
          from={pending.dateFrom}
          to={pending.dateTo}
          preset={datePreset}
          onApply={({ from, to, preset }) => {
            setDatePreset(preset);
            setPending((p) => ({ ...p, dateFrom: from, dateTo: to }));
          }}
        />

        {pendingCount > 0 && (
          <Button size="sm" onClick={applyFilters}
            className="h-9 bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md animate-pulse">
            Lọc <span className="ml-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">{pendingCount}</span>
          </Button>
        )}

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" className="h-9 text-slate-500" onClick={clearAll}>
            <X className="h-4 w-4 mr-1" />Xóa lọc
          </Button>
        )}
      </div>

      {/* Notice vàng khi có pending */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Có <strong>{pendingCount}</strong> thay đổi chưa áp dụng - bấm <strong>Lọc</strong> để xem kết quả.</span>
        </div>
      )}

      {/* Panel mở rộng: các select */}
      {expanded && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 pt-2 border-t border-slate-100">
          <FilterField label="Trạng thái" value={pending.status} onChange={(v) => update('status', v)}
            options={PAYMENT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} searchPlaceholder="Tìm trạng thái..." />
          <FilterField label="Hình thức TT" value={pending.paymentTypeId} onChange={(v) => update('paymentTypeId', v)}
            options={paymentTypes.map((t) => ({ value: t.id, label: t.name }))} searchPlaceholder="Tìm hình thức..." />
          <FilterField label="Sản phẩm" value={pending.productId} onChange={(v) => update('productId', v)}
            options={products.map((p) => ({ value: p.id, label: p.name }))} searchPlaceholder="Tìm sản phẩm..." />
          <FilterField label="Nhóm SP" value={pending.productGroupId} onChange={(v) => update('productGroupId', v)}
            options={productGroups.map((g) => ({ value: g.id, label: g.name }))} searchPlaceholder="Tìm nhóm..." />
          {isManagerPlus && (
            <FilterField label="Người tạo" value={pending.createdBy} onChange={(v) => update('createdBy', v)}
              options={users.map((u) => ({ value: u.id, label: u.name }))} searchPlaceholder="Tìm người tạo..." />
          )}
          {isManagerPlus && teams.length > 0 && (
            <FilterField label="Nhóm sale" value={pending.teamId} onChange={(v) => update('teamId', v)}
              options={teams.map((t) => ({ value: t.id, label: t.name }))} searchPlaceholder="Tìm nhóm sale..." />
          )}
        </div>
      )}
    </div>
  );
}

/** Multi-select 1 dòng có label - bọc FilterSearchableSelect (mảng rỗng = "Tất cả"). */
function FilterField({ label, value, onChange, options, searchPlaceholder }: {
  label: string; value: string[]; onChange: (v: string[]) => void;
  options: { value: string; label: string }[]; searchPlaceholder: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
      <FilterSearchableSelect value={value} onChange={onChange} options={options} searchPlaceholder={searchPlaceholder} />
    </div>
  );
}
