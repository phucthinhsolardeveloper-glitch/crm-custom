'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { normalizeVi } from '@/lib/normalize-vietnamese';
import { cn } from '@/lib/utils';

export interface FilterSelectOption {
  value: string;
  label: string;
  /** Chấm màu trước label (dùng cho Nhãn). Optional. */
  dotColor?: string;
}

interface FilterSearchableSelectProps {
  /** Danh sách value đang chọn (multi-select). Mảng rỗng = chưa chọn gì ("Tất cả"). */
  value: string[];
  onChange: (values: string[]) => void;
  options: FilterSelectOption[];
  placeholder?: string;
  /** Label cho mục "tất cả" (clear toàn bộ lựa chọn). Mặc định "Tất cả". */
  allLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

const PAGE_SIZE = 12;

/**
 * Dropdown có ô tìm kiếm cho filter bar trang /leads.
 *
 * Khác source-combobox.tsx (tự fetch qua hook): component này nhận `options` qua
 * props -> dùng được cho Nguồn / Nhóm / Sản phẩm / Nhân viên với data đã có sẵn
 * từ RSC page. Tái dùng pattern: Popover + ô search bỏ dấu tiếng Việt (normalizeVi)
 * + lazy render PAGE_SIZE entries (IntersectionObserver) cho danh sách dài.
 *
 * Multi-select: `value` là mảng các id đang chọn. Click item = toggle (không đóng popover),
 * cho phép chọn nhiều. Mục "Tất cả" ở đầu list để clear toàn bộ. Trigger hiển thị label khi
 * chọn đúng 1, hoặc "N đã chọn" khi nhiều.
 */
export function FilterSearchableSelect({
  value, onChange, options,
  placeholder = 'Tất cả',
  allLabel = 'Tất cả',
  searchPlaceholder = 'Tìm...',
  disabled,
  triggerClassName,
}: FilterSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Ảnh chụp tập value đang chọn tại thời điểm MỞ popover. Dùng để đẩy các mục đã chọn
  // lên đầu danh sách - "chốt" lúc mở nên item KHÔNG nhảy vị trí khi đang tick/bỏ tick,
  // tránh click nhầm. Lần mở kế tiếp sẽ chụp lại theo lựa chọn mới nhất.
  const [selectedOnOpen, setSelectedOnOpen] = useState<string[]>([]);

  // Sắp các mục đã-chọn-lúc-mở lên đầu (giữ nguyên thứ tự gốc trong từng nhóm).
  const orderedOptions = useMemo(() => {
    if (selectedOnOpen.length === 0) return options;
    const picked = new Set(selectedOnOpen);
    const top = options.filter((o) => picked.has(o.value));
    const bottom = options.filter((o) => !picked.has(o.value));
    return [...top, ...bottom];
  }, [options, selectedOnOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return orderedOptions;
    const q = normalizeVi(query);
    return orderedOptions.filter((o) => normalizeVi(o.label).includes(q));
  }, [orderedOptions, query]);

  const visibleItems = filtered.slice(0, visibleCount);
  const hasSelection = value.length > 0;
  // Khi chọn đúng 1 -> hiển thị label (kèm dotColor nếu có). Nhiều -> "N đã chọn".
  const singleSelected = value.length === 1 ? options.find((o) => o.value === value[0]) : undefined;

  // Toggle 1 value trong mảng (thêm nếu chưa có, bớt nếu đã có). Không đóng popover.
  const toggleValue = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  // Reset visibleCount khi đổi query (tránh hiển thị thiếu kết quả filter mới)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  // Đóng popover -> reset ô search (lần mở kế tiếp bắt đầu sạch).
  // Mở popover -> chụp lại tập đang chọn để đẩy chúng lên đầu danh sách.
  // Cố tình chỉ phụ thuộc `open`: chỉ chụp tại thời điểm mở, không chụp lại mỗi lần tick.
  useEffect(() => {
    if (open) {
      setSelectedOnOpen(value);
    } else {
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            'flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
            triggerClassName,
          )}
        >
          <span className={cn('flex items-center gap-1.5 truncate text-left', !hasSelection && 'text-slate-400')}>
            {singleSelected?.dotColor && (
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: singleSelected.dotColor }} />
            )}
            {!hasSelection
              ? placeholder
              : singleSelected
                ? singleSelected.label
                : `${value.length} đã chọn`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b border-slate-100 px-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {/* Mục "Tất cả" - clear toàn bộ lựa chọn. Luôn hiển thị khi không gõ search. */}
          {!query.trim() && (
            <button
              type="button"
              onClick={() => onChange([])}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50',
                !hasSelection && 'bg-sky-50 text-sky-700',
              )}
            >
              <span className="truncate">{allLabel}</span>
              {!hasSelection && <Check className="ml-2 h-4 w-4 shrink-0 text-sky-600" />}
            </button>
          )}

          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Không tìm thấy</div>
          )}

          {visibleItems.map((o) => {
            const isSelected = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleValue(o.value)}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50',
                  isSelected && 'bg-sky-50 text-sky-700',
                )}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {o.dotColor && (
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.dotColor }} />
                  )}
                  {o.label}
                </span>
                {isSelected && <Check className="ml-2 h-4 w-4 shrink-0 text-sky-600" />}
              </button>
            );
          })}
          {visibleCount < filtered.length && <div ref={sentinelRef} className="h-4" />}
        </div>
      </PopoverContent>
    </Popover>
  );
}
