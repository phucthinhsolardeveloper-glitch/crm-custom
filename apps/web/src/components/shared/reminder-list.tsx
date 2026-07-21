'use client';

import { Clock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ReminderItem {
  remindAt: string; // ISO
  label?: string;
}

interface ReminderListProps {
  dueDate: string | null; // ISO
  reminders: ReminderItem[];
  onChange: (reminders: ReminderItem[]) => void;
  maxReminders?: number; // default 5
  disabled?: boolean;
}

interface ReminderRowProps {
  reminder: ReminderItem;
  dueDate: string | null;
  disabled?: boolean;
  onEdit: (r: ReminderItem) => void;
  onDelete: () => void;
}

// --- Timezone helpers ---

/** Convert ISO string → YYYY-MM-DDTHH:mm in browser local time (for datetime-local input). */
function toInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Convert datetime-local value → ISO string. Empty string → empty string. */
function fromInputValue(v: string): string {
  if (!v) return '';
  return new Date(v).toISOString();
}

// --- Sub-component ---

function ReminderRow({ reminder, dueDate, disabled, onEdit, onDelete }: ReminderRowProps) {
  const now = new Date();
  const remindDate = new Date(reminder.remindAt);
  const isPast = remindDate < now;
  const afterDue = Boolean(dueDate && remindDate >= new Date(dueDate));

  return (
    <div
      data-testid="reminder-row"
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg border border-slate-200',
        isPast && 'opacity-60 bg-slate-50',
        afterDue && 'border-red-300 bg-red-50',
      )}
    >
      <Clock size={14} className="shrink-0 text-slate-400" />

      <input
        type="datetime-local"
        value={toInputValue(reminder.remindAt)}
        disabled={disabled}
        onChange={e => onEdit({ ...reminder, remindAt: fromInputValue(e.target.value) })}
        className="text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-sky-400 rounded px-1 disabled:cursor-not-allowed"
        aria-label="Thời điểm nhắc nhở"
      />

      <input
        type="text"
        placeholder="Ghi chú mốc (tuỳ chọn)"
        value={reminder.label ?? ''}
        disabled={disabled}
        maxLength={50}
        onChange={e => onEdit({ ...reminder, label: e.target.value })}
        className="flex-1 min-w-0 text-xs text-slate-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-sky-400 rounded px-1 disabled:cursor-not-allowed"
        aria-label="Ghi chú mốc nhắc nhở"
      />

      {isPast && !afterDue && (
        <span className="shrink-0 text-xs text-amber-600 whitespace-nowrap">⚠ đã qua</span>
      )}
      {afterDue && (
        <span className="shrink-0 text-xs text-red-600 whitespace-nowrap">⚠ sau hạn</span>
      )}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={onDelete}
        className="shrink-0 h-7 w-7 p-0 text-slate-400 hover:text-red-500"
        aria-label="Xóa mốc nhắc nhở"
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

// --- Exported helper ---

export function computeDefaultReminders(dueDate: Date, now = new Date()): ReminderItem[] {
  const candidates = [
    { offset: 86_400_000, label: '1 ngày trước' },
    { offset: 3_600_000, label: '1 giờ trước' },
    { offset: 1_800_000, label: '30 phút trước' },
  ];
  return candidates
    .map(c => ({ remindAt: new Date(dueDate.getTime() - c.offset).toISOString(), label: c.label }))
    .filter(r => new Date(r.remindAt) > now);
}

// --- Main component ---

export default function ReminderList({
  dueDate,
  reminders,
  onChange,
  maxReminders = 5,
  disabled = false,
}: ReminderListProps) {
  const atMax = reminders.length >= maxReminders;
  const addDisabled = disabled || atMax || !dueDate;

  function handleAdd() {
    const base = Date.now() + 15 * 60_000;
    const proposed = dueDate ? Math.min(base, new Date(dueDate).getTime() - 1) : base;
    const remindAt = new Date(proposed).toISOString();
    onChange([...reminders, { remindAt, label: '' }]);
  }

  function handleEdit(index: number, updated: ReminderItem) {
    onChange(reminders.map((r, i) => (i === index ? updated : r)));
  }

  function handleDelete(index: number) {
    onChange(reminders.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">
          Nhắc nhở (tối đa {maxReminders})
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={addDisabled}
          onClick={handleAdd}
          data-testid="add-reminder"
          className="h-7 gap-1 text-sky-600 hover:text-sky-700 hover:bg-sky-50 disabled:opacity-40"
        >
          <Plus size={14} />
          Thêm mốc nhắc
        </Button>
      </div>

      {/* Empty state */}
      {reminders.length === 0 && (
        <p className="text-xs text-amber-600">
          ⚠️ Công việc sẽ không có nhắc nhở nào
        </p>
      )}

      {/* Reminder rows */}
      {reminders.map((r, i) => (
        <ReminderRow
          key={i}
          reminder={r}
          dueDate={dueDate}
          disabled={disabled}
          onEdit={updated => handleEdit(i, updated)}
          onDelete={() => handleDelete(i)}
        />
      ))}
    </div>
  );
}
