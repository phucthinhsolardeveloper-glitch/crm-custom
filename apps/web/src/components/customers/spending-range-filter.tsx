'use client';

import { useState, useEffect } from 'react';
import { Wallet, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Preset {
  label: string;
  min: number | null;
  max: number | null;
}

const PRESETS: Preset[] = [
  { label: 'Tất cả', min: null, max: null },
  { label: 'Dưới 5tr', min: null, max: 5_000_000 },
  { label: '5 - 20tr', min: 5_000_000, max: 20_000_000 },
  { label: '20 - 100tr', min: 20_000_000, max: 100_000_000 },
  { label: 'Trên 100tr', min: 100_000_000, max: null },
];

function formatThousand(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

function parseInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatShortVND(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

function describeRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'Chi tiêu';
  if (min !== null && max === null) return `Trên ${formatShortVND(min)}`;
  if (min === null && max !== null) return `Dưới ${formatShortVND(max)}`;
  return `${formatShortVND(min!)} - ${formatShortVND(max!)}`;
}

function matchesPreset(min: number | null, max: number | null, p: Preset): boolean {
  return p.min === min && p.max === max;
}

interface Props {
  currentMin: number | null;
  currentMax: number | null;
  onApply: (min: number | null, max: number | null) => void;
  onClear: () => void;
}

/** Spending range filter - chip trigger opens popover with presets + custom inputs. */
export function SpendingRangeFilter({ currentMin, currentMax, onApply, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [localMin, setLocalMin] = useState<number | null>(currentMin);
  const [localMax, setLocalMax] = useState<number | null>(currentMax);
  const [minInput, setMinInput] = useState<string>(currentMin !== null ? formatThousand(currentMin) : '');
  const [maxInput, setMaxInput] = useState<string>(currentMax !== null ? formatThousand(currentMax) : '');

  // Reseed local state when popover opens or external props change.
  useEffect(() => {
    if (open) {
      setLocalMin(currentMin);
      setLocalMax(currentMax);
      setMinInput(currentMin !== null ? formatThousand(currentMin) : '');
      setMaxInput(currentMax !== null ? formatThousand(currentMax) : '');
    }
  }, [open, currentMin, currentMax]);

  const isActive = currentMin !== null || currentMax !== null;
  const chipLabel = isActive ? `Chi tiêu: ${describeRange(currentMin, currentMax)}` : 'Chi tiêu';

  function applyPreset(p: Preset) {
    setLocalMin(p.min);
    setLocalMax(p.max);
    setMinInput(p.min !== null ? formatThousand(p.min) : '');
    setMaxInput(p.max !== null ? formatThousand(p.max) : '');
  }

  function handleMinInput(raw: string) {
    const parsed = parseInput(raw);
    setMinInput(parsed !== null ? formatThousand(parsed) : raw);
    setLocalMin(parsed);
  }

  function handleMaxInput(raw: string) {
    const parsed = parseInput(raw);
    setMaxInput(parsed !== null ? formatThousand(parsed) : raw);
    setLocalMax(parsed);
  }

  function handleApply() {
    if (localMin !== null && localMax !== null && localMax < localMin) return;
    onApply(localMin, localMax);
    setOpen(false);
  }

  function handleReset() {
    setLocalMin(null);
    setLocalMax(null);
    setMinInput('');
    setMaxInput('');
    onClear();
    setOpen(false);
  }

  function handleChipClear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onClear();
  }

  const invalidRange = localMin !== null && localMax !== null && localMax < localMin;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
            isActive
              ? 'border-transparent bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-[0_8px_20px_-8px_rgba(245,158,11,0.5)]'
              : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700',
          )}
        >
          <Wallet className="h-3.5 w-3.5" />
          <span>{chipLabel}</span>
          {isActive && (
            <span
              role="button"
              aria-label="Xoá lọc chi tiêu"
              onClick={handleChipClear}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[360px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Wallet className="h-4 w-4 text-amber-500" />
            Lọc theo tổng chi tiêu
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active = matchesPreset(localMin, localMax, p);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all',
                  active
                    ? 'border-transparent bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_8px_20px_-8px_rgba(14,165,233,0.5)]'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-300 hover:text-sky-700',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="mb-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Hoặc nhập khoảng tuỳ chỉnh (VND)
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={minInput}
              onChange={(e) => handleMinInput(e.target.value)}
              placeholder="Tối thiểu"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            />
            <span className="text-slate-400">-</span>
            <input
              type="text"
              inputMode="numeric"
              value={maxInput}
              onChange={(e) => handleMaxInput(e.target.value)}
              placeholder="Tối đa"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
          {invalidRange && (
            <div className="mt-2 text-xs font-semibold text-rose-500">
              Tối đa phải lớn hơn hoặc bằng tối thiểu
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Đặt lại
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={invalidRange}
            className={cn(
              'rounded-lg px-4 py-2 text-xs font-bold text-white shadow-[0_10px_30px_-10px_rgba(14,165,233,0.35)] transition-all',
              invalidRange
                ? 'cursor-not-allowed bg-slate-300'
                : 'bg-gradient-to-br from-sky-500 to-cyan-500 hover:-translate-y-px',
            )}
          >
            Áp dụng
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
