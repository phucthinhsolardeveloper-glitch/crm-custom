'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, RefreshCw, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useLeadSources } from '@/hooks/use-lead-sources';
import { normalizeVi } from '@/lib/normalize-vietnamese';
import { cn } from '@/lib/utils';

interface SourceComboboxProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const PAGE_SIZE = 10;

/**
 * Combobox chọn nguồn lead với search + lazy display.
 * - Cache 24h client-side (localStorage) qua useLeadSources hook.
 * - Search bỏ dấu tiếng Việt (normalizeVi).
 * - Lazy display PAGE_SIZE entries, scroll cuối -> +PAGE_SIZE (IntersectionObserver).
 * - Refresh button override cache khi admin sửa source và user cần thấy ngay.
 */
export function SourceCombobox({ value, onChange, disabled, placeholder = 'Chọn nguồn...' }: SourceComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { sources, loading, refetch } = useLeadSources(open || value !== '');

  const filtered = useMemo(() => {
    const list = [...sources].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    if (!query.trim()) return list;
    const q = normalizeVi(query);
    return list.filter((s) => normalizeVi(s.name).includes(q));
  }, [sources, query]);

  const visibleItems = filtered.slice(0, visibleCount);
  const selectedName = sources.find((s) => s.id === value)?.name ?? '';

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
          <span className={cn('truncate text-left', !selectedName && 'text-slate-400')}>
            {selectedName || placeholder}
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
            placeholder="Tìm nguồn..."
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

        <div className="max-h-64 overflow-y-auto py-1">
          {loading && sources.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Đang tải...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Không tìm thấy nguồn</div>
          )}
          {visibleItems.map((s) => {
            const selected = s.id === value;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50',
                  selected && 'bg-sky-50 text-sky-700',
                )}
              >
                <span className="truncate">{s.name}</span>
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
