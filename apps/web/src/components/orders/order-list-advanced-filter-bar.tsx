'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';

// Order chi co 2 trang thai: PENDING, COMPLETED.
const STATUSES = [
  { value: 'PENDING', label: 'Chờ xử lý' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
];

interface FilterBarProps {
  products: { id: string; name: string }[];
  users: { id: string; name: string }[];
  orderFormats: { id: string; name: string }[];
  productGroups: { id: string; name: string }[];
}

const STORAGE_KEY = 'crm_order_filters';

/** Advanced filter bar for orders list - URL-based state (shareable). */
export function OrderListAdvancedFilterBar({ products, users, orderFormats, productGroups }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [restored, setRestored] = useState(false);

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

  const currentSearch = searchParams.get('search') || '';
  const currentStatus = searchParams.get('status') || '';
  const currentProductId = searchParams.get('productId') || '';
  const currentCreatedBy = searchParams.get('createdBy') || '';
  const currentFormatId = searchParams.get('formatId') || '';
  const currentProductGroupId = searchParams.get('productGroupId') || '';
  const currentDateFrom = searchParams.get('dateFrom') || '';
  const currentDateTo = searchParams.get('dateTo') || '';

  const activeFilterCount = [
    currentStatus, currentProductId, currentCreatedBy,
    currentFormatId, currentProductGroupId, currentDateFrom, currentDateTo,
  ].filter(Boolean).length;

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) { params.set(key, value); } else { params.delete(key); }
    params.delete('cursor');
    const qs = params.toString();
    localStorage.setItem(STORAGE_KEY, qs);
    router.push(`${pathname}?${qs}`);
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    router.push(pathname);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            defaultValue={currentSearch}
            placeholder="Tìm theo tên KH, SĐT, mã khoá..."
            onKeyDown={e => { if (e.key === 'Enter') updateFilter('search', (e.target as HTMLInputElement).value); }}
            onBlur={e => { if (e.target.value !== currentSearch) updateFilter('search', e.target.value); }}
            className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <Button size="sm" variant={expanded ? 'default' : 'outline'} onClick={() => setExpanded(!expanded)}>
          <Filter className="h-4 w-4 mr-1" />
          Bộ lọc
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">{activeFilterCount}</span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
        </Button>
        {activeFilterCount > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}><X className="h-4 w-4 mr-1" />Xóa lọc</Button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Trạng thái</label>
            <Select value={currentStatus} onValueChange={v => updateFilter('status', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Sản phẩm</label>
            <Select value={currentProductId} onValueChange={v => updateFilter('productId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Người tạo</label>
            <Select value={currentCreatedBy} onValueChange={v => updateFilter('createdBy', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Hình thức</label>
            <Select value={currentFormatId} onValueChange={v => updateFilter('formatId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {orderFormats.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Nhóm sản phẩm</label>
            <Select value={currentProductGroupId} onValueChange={v => updateFilter('productGroupId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {productGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Từ ngày giờ</label>
            <input type="datetime-local" value={currentDateFrom} onChange={e => updateFilter('dateFrom', e.target.value)}
              className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Đến ngày giờ</label>
            <input type="datetime-local" value={currentDateTo} onChange={e => updateFilter('dateTo', e.target.value)}
              className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>
      )}
    </div>
  );
}
