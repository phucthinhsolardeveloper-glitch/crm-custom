'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, RefreshCw, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useProducts } from '@/hooks/use-products';
import { normalizeVi } from '@/lib/normalize-vietnamese';
import { cn, formatVND } from '@/lib/utils';

interface ProductComboboxProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Hiển thị giá kèm tên (vd: trong dialog tạo đơn hàng). Mặc định false để tương thích combobox cũ. */
  showPrice?: boolean;
}

const PAGE_SIZE = 10;

/**
 * Combobox chọn sản phẩm với search + lazy display.
 * - Cache 24h client-side (localStorage) qua useProducts hook.
 * - Search bỏ dấu tiếng Việt (normalizeVi).
 * - Lazy display PAGE_SIZE entries, scroll cuối -> +PAGE_SIZE (IntersectionObserver).
 * - Refresh button override cache khi admin sửa sản phẩm và user cần thấy ngay.
 *
 * Pattern y hệt SourceCombobox - duplicate UI để tránh abstract sớm; nếu cần entity thứ 3 sẽ extract.
 */
export function ProductCombobox({ value, onChange, disabled, placeholder = 'Chọn sản phẩm...', showPrice = false }: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { products, loading, refetch } = useProducts(open || value !== '');

  const filtered = useMemo(() => {
    const list = [...products].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    if (!query.trim()) return list;
    const q = normalizeVi(query);
    return list.filter((p) => normalizeVi(p.name).includes(q));
  }, [products, query]);

  const visibleItems = filtered.slice(0, visibleCount);
  const selectedProduct = products.find((p) => p.id === value);
  const selectedLabel = selectedProduct
    ? (showPrice ? `${selectedProduct.name} - ${formatVND(selectedProduct.price)}` : selectedProduct.name)
    : '';

  // Reset visibleCount khi đổi query (tránh hiển thị thiếu kết quả filter mới)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  // Reset query khi đóng popover (next mở lại bắt đầu sạch)
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // IntersectionObserver: cuộn sentinel vào view -> tăng visibleCount
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [open, filtered.length, visibleCount]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className={cn('truncate text-left', !selectedLabel && 'text-slate-400')}>
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b border-slate-100 px-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm sản phẩm..."
            className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
            autoFocus
          />
          <button
            type="button"
            onClick={() => { void refetch(); }}
            title="Tải lại danh sách"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        <div
          className="max-h-64 overflow-y-auto py-1"
          onWheel={(e) => {
            // Fix Radix Dialog + Popover nested: react-remove-scroll khóa wheel ngoài Dialog
            // → Popover Portal bị block. Tự scroll manual + stopPropagation để wheel chạy lại.
            e.currentTarget.scrollTop += e.deltaY;
            e.stopPropagation();
          }}
        >
          {loading && products.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Đang tải...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Không tìm thấy sản phẩm</div>
          )}
          {visibleItems.map((p) => {
            const selected = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50',
                  selected && 'bg-sky-50 text-sky-700',
                )}
              >
                <span className="truncate flex-1">
                  {p.name}
                  {showPrice && (
                    <span className="text-slate-400 ml-1">- {formatVND(p.price)}</span>
                  )}
                </span>
                {selected && <Check className="h-4 w-4 text-sky-600 shrink-0 ml-2" />}
              </button>
            );
          })}
          {visibleCount < filtered.length && <div ref={sentinelRef} className="h-4" />}
        </div>
      </PopoverContent>
    </Popover>
  );
}
