'use client';

import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DATE_PRESETS, applyDatePreset, type DatePresetKey } from '@/lib/datetime-utc7';

interface DateTimeRangePickerProps {
  /** Local string yyyy-MM-ddTHH:mm (UTC+7). '' = chưa set. */
  from: string;
  to: string;
  preset: DatePresetKey;
  /** Emit khi bấm "Xong" (gom from/to/preset 1 lần). */
  onApply: (next: { from: string; to: string; preset: DatePresetKey }) => void;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const pad2 = (n: number) => String(n).padStart(2, '0');

/** yyyy-MM-ddTHH:mm -> Date wall-clock. Chỉ dùng y/m/d (VN không DST nên an toàn). */
function parseDate(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function parseTime(s: string): string {
  return s ? s.split('T')[1] || '00:00' : '00:00';
}
/** Date + 'HH:mm' -> yyyy-MM-ddTHH:mm (đọc y/m/d local). */
function combine(date: Date, time: string): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${time}`;
}
/** yyyy-MM-ddTHH:mm -> "DD/MM/YYYY HH:mm". */
function labelOf(s: string): string {
  if (!s) return '';
  const [d, t = '00:00'] = s.split('T');
  const [y, mo, day] = d.split('-');
  if (!y || !mo || !day) return '';
  return `${day}/${mo}/${y} ${t}`;
}

/**
 * Picker khoảng thời gian: 1 nút trigger gọn -> popover lịch 2 tháng (range) +
 * chọn giờ 24h (Từ giờ / Đến giờ) + preset nhanh.
 *
 * LUÔN hiển thị giờ 24h bất kể regional format OS (không dùng datetime-local).
 * Value format giữ `yyyy-MM-ddTHH:mm` để tương thích `datetime-utc7` helpers.
 *
 * Draft pattern: chỉnh trong popover không emit ngay, bấm "Xong" mới gom
 * from/to/preset gọi onApply 1 lần (giảm re-render + cho user review range).
 */
export function DateTimeRangePicker({ from, to, preset, onApply, className }: DateTimeRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');
  const [draftPreset, setDraftPreset] = useState<DatePresetKey>(preset);

  // Reset draft từ props mỗi lần mở popover.
  const initDraft = useCallback(() => {
    const f = parseDate(from);
    const t = parseDate(to);
    setRange(f ? { from: f, to: t ?? f } : undefined);
    setFromTime(parseTime(from));
    setToTime(to ? parseTime(to) : '23:59');
    setDraftPreset(preset);
  }, [from, to, preset]);

  const handleOpenChange = (v: boolean) => {
    if (v) initDraft();
    setOpen(v);
  };

  const handleRangeSelect = (r: DateRange | undefined) => {
    setRange(r);
    setDraftPreset('custom'); // chọn tay -> không còn khớp preset
  };

  const handlePreset = (key: DatePresetKey) => {
    setDraftPreset(key);
    const r = applyDatePreset(key);
    if (!r) return;
    setRange({ from: parseDate(r.from)!, to: parseDate(r.to)! });
    setFromTime(parseTime(r.from));
    setToTime(parseTime(r.to));
  };

  const apply = () => {
    if (!range?.from) {
      onApply({ from: '', to: '', preset: 'custom' });
    } else {
      const end = range.to ?? range.from;
      onApply({ from: combine(range.from, fromTime), to: combine(end, toTime), preset: draftPreset });
    }
    setOpen(false);
  };

  const clear = () => {
    setRange(undefined);
    onApply({ from: '', to: '', preset: 'custom' });
    setOpen(false);
  };

  const hasValue = !!(from || to);
  const triggerLabel = hasValue ? `${labelOf(from) || '...'} - ${labelOf(to) || '...'}` : 'Chọn thời gian';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 min-w-[180px] max-w-[340px] items-center gap-1.5 rounded-md border border-slate-200 px-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-sky-500',
            !hasValue && 'text-slate-400',
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{triggerLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={handleRangeSelect}
          defaultMonth={range?.from}
        />
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-3 py-2">
          <TimeSelect label="Từ giờ" value={fromTime} onChange={(v) => { setFromTime(v); setDraftPreset('custom'); }} />
          <TimeSelect label="Đến giờ" value={toTime} onChange={(v) => { setToTime(v); setDraftPreset('custom'); }} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2">
          {DATE_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePreset(p.key)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                draftPreset === p.key
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7" onClick={clear}>Xóa</Button>
            <Button size="sm" className="h-7 bg-sky-500 hover:bg-sky-600" onClick={apply}>Xong</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SELECT_CLS = 'h-8 rounded-md border border-slate-200 px-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [h = '00', m = '00'] = value.split(':');
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <select value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)} aria-label={`${label} - giờ`} className={SELECT_CLS}>
        {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-slate-400">:</span>
      <select value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)} aria-label={`${label} - phút`} className={SELECT_CLS}>
        {MINUTES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}
