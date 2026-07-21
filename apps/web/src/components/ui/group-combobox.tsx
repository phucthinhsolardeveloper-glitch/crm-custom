'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, RefreshCw, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { getLeadGroups, getLeadSources, type LeadGroupOption } from '@/lib/api/lead-form-bootstrap-cache';
import { normalizeVi } from '@/lib/normalize-vietnamese';
import { cn } from '@/lib/utils';

interface GroupComboboxProps {
  value: string;
  /** Trả groupId + sourceId (nguồn cha) để caller tự fill ô Nguồn nếu cần. */
  onChange: (id: string, sourceId?: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const PAGE_SIZE = 10;

interface GroupItem extends LeadGroupOption {
  /** Tên nguồn cha để hiển thị + cho phép tìm kiếm theo nguồn. */
  parentName: string;
}

/**
 * Combobox chọn nhóm lead với search + lazy display.
 * - KHÔNG phụ thuộc Nguồn: hiện TẤT CẢ nhóm; chọn nhóm -> backend tự suy ra Nguồn cha.
 * - Mỗi item hiển thị "Tên nhóm (Nguồn cha)" + search được cả theo tên nhóm lẫn nguồn.
 * - Cache 4h client-side qua getLeadGroups()/getLeadSources() (version check tự refresh).
 * - Search bỏ dấu tiếng Việt (normalizeVi). Lazy display PAGE_SIZE/scroll.
 */
export function GroupCombobox({ value, onChange, disabled, placeholder = 'Chọn nhóm...' }: GroupComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [items, setItems] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Load nhóm + nguồn (để map tên nguồn cha). Chạy khi mở hoặc đã có value cần hiển thị tên.
  const enabled = open || value !== '';
  const loadedRef = useRef(false);

  async function load() {
    setLoading(true);
    try {
      const [groups, sources] = await Promise.all([getLeadGroups(), getLeadSources()]);
      const sourceNameById = new Map(sources.map((s) => [String(s.id), s.name]));
      setItems(groups.map((g) => ({ ...g, parentName: sourceNameById.get(g.sourceId) ?? '' })));
      loadedRef.current = true;
    } catch {
      // Giữ state cũ nếu lỗi mạng.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    void load();
  }, [enabled]);

  const filtered = useMemo(() => {
    const list = [...items].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    if (!query.trim()) return list;
    const q = normalizeVi(query);
    return list.filter((g) => normalizeVi(`${g.name} ${g.parentName}`).includes(q));
  }, [items, query]);

  const visibleItems = filtered.slice(0, visibleCount);
  const selected = items.find((g) => g.id === value);
  const selectedLabel = selected ? (selected.parentName ? `${selected.name} (${selected.parentName})` : selected.name) : '';

  // Reset visibleCount khi đổi query
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query]);
  // Reset query khi đóng popover
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // IntersectionObserver: cuộn cuối -> tăng visibleCount
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
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
            placeholder="Tìm nhóm..."
            className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
            autoFocus
          />
          <button
            type="button"
            onClick={() => { loadedRef.current = false; void load(); }}
            title="Tải lại danh sách"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {loading && items.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Đang tải...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-slate-400">Không tìm thấy nhóm</div>
          )}
          {visibleItems.map((g) => {
            const isSelected = g.id === value;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => { onChange(g.id, g.sourceId); setOpen(false); }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50',
                  isSelected && 'bg-sky-50 text-sky-700',
                )}
              >
                <span className="truncate">
                  {g.name}
                  {g.parentName && <span className="text-slate-400"> ({g.parentName})</span>}
                </span>
                {isSelected && <Check className="h-4 w-4 text-sky-600 shrink-0 ml-2" />}
              </button>
            );
          })}
          {visibleCount < filtered.length && <div ref={sentinelRef} className="h-4" />}
        </div>
      </PopoverContent>
    </Popover>
  );
}
