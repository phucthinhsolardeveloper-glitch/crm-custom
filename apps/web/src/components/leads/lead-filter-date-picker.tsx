'use client';

import { useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DatePresetKey } from '@/lib/datetime-utc7';
import type { LeadTimeFilterMode } from '@/components/leads/lead-filter-pending-context';
import { DateTimeRangePicker } from '@/components/shared/date-time-range-picker';

interface LeadFilterDatePickerProps {
  mode: LeadTimeFilterMode;
  onModeChange: (mode: LeadTimeFilterMode) => void;
  preset: DatePresetKey;
  onPresetChange: (preset: DatePresetKey) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

/**
 * Khung filter thời gian cho trang /leads.
 *
 * Layout: [Loại: Ngày tạo/Ngày phân] [DateTimeRangePicker trigger]
 *
 * DateTimeRangePicker mở popover lịch 2 tháng + chọn giờ 24h + preset nhanh.
 * Bấm "Xong" trong popover gom from/to/preset emit 1 lần -> pending state.
 * User bấm "Lọc" ở parent để apply.
 */
export function LeadFilterDatePicker({
  mode, onModeChange,
  preset, onPresetChange,
  from, to,
  onFromChange, onToChange,
}: LeadFilterDatePickerProps) {
  const handleApply = useCallback((next: { from: string; to: string; preset: DatePresetKey }) => {
    onFromChange(next.from);
    onToChange(next.to);
    onPresetChange(next.preset);
  }, [onFromChange, onToChange, onPresetChange]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={mode} onValueChange={(v) => onModeChange(v as LeadTimeFilterMode)}>
        <SelectTrigger className="h-9 w-[130px] text-sm" title="Loại thời gian filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="createdAt">Ngày tạo</SelectItem>
          <SelectItem value="assignedAt">Ngày phân</SelectItem>
        </SelectContent>
      </Select>

      <DateTimeRangePicker
        from={from}
        to={to}
        preset={preset}
        onApply={handleApply}
      />
    </div>
  );
}
