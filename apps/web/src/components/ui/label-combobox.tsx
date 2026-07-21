'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { normalizeVi } from '@/lib/normalize-vietnamese';
import { cn } from '@/lib/utils';

interface LabelOption {
  id: string;
  name: string;
  color: string;
  textColor?: string;
}

interface LabelComboboxProps {
  value: string;
  /** Pass '' to clear selection. Caller decides nullable semantic ('' → null on submit). */
  onChange: (id: string) => void;
  labels: LabelOption[];
  disabled?: boolean;
  placeholder?: string;
  /** Khi true: cho phép chọn option "Bỏ nhãn" (sẽ trả về ''). Default true. */
  allowClear?: boolean;
}

const PAGE_SIZE = 20;

/**
 * Combobox chọn nhãn với search bỏ dấu tiếng Việt + lazy display.
 * Pattern y hệt ProductCombobox/SourceCombobox - nhận labels qua prop (không cache hook,
 * vì page truyền sẵn từ RSC fetch /labels).
 */
export function LabelCombobox({
  value, onChange, labels, disabled, placeholder = 'Chọn nhãn...', allowClear = true,
}: LabelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const list = [...labels].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    if (!query.trim()) return list;
    const q = normalizeVi(query);
    return list.filter((l) => normalizeVi(l.name).includes(q));
  }, [labels, query]);

  const visibleItems = filtered.slice(0, visibleCount);
  const selected = labels.find((l) => l.id === value);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query]);
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // IntersectionObserver: scroll sentinel vào view → tăng visibleCount.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length)); },
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
          <span className={cn('flex items-center gap-1.5 truncate text-left', !selected && 'text-slate-400')}>
            {selected ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
                {selected.name}
              </>
            ) : placeholder}
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
            placeholder="Tìm nhãn..."
            className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
            autoFocus
          />
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
          {allowClear && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50',
                value === '' && 'bg-sky-50 text-sky-700',
              )}
            >
              <span className="italic">- Bỏ nhãn -</span>
              {value === '' && <Check className="h-4 w-4 text-sky-600 shrink-0 ml-2" />}
            </button>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Không tìm thấy nhãn</div>
          )}
          {visibleItems.map((l) => {
            const isSel = l.id === value;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => { onChange(l.id); setOpen(false); }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50',
                  isSel && 'bg-sky-50 text-sky-700',
                )}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  {l.name}
                </span>
                {isSel && <Check className="h-4 w-4 text-sky-600 shrink-0 ml-2" />}
              </button>
            );
          })}
          {visibleCount < filtered.length && <div ref={sentinelRef} className="h-4" />}
        </div>
      </PopoverContent>
    </Popover>
  );
}
