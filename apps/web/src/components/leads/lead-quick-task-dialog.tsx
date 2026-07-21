'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import ReminderList, { computeDefaultReminders, type ReminderItem } from '@/components/shared/reminder-list';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName?: string;
  onSuccess?: () => void;
}

// --- Timezone helpers (giống note-dialog) ---

function toInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputValue(v: string): string {
  return v ? new Date(v).toISOString() : '';
}

/**
 * Dialog "Đặt lịch" gắn với 1 lead - UI rút gọn theo panel createTask của NoteDialog.
 * Field: Tiêu đề + Hạn + Reminders (max 5). Bỏ Mô tả, Ưu tiên, Giao cho (auto = user hiện tại).
 *
 * Auto-fill reminders khi user chọn dueDate (1d/1h/30m trước hạn). User có thể tự thêm/xoá.
 */
export function LeadQuickTaskDialog({ open, onOpenChange, leadId, leadName, onSuccess }: Props) {
  const router = useRouter();
  const { user } = useAuth();

  const [taskTitle, setTaskTitle] = useState('');
  const [dueDate, setDueDate] = useState(''); // ISO string
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [reminderCustomized, setReminderCustomized] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setTaskTitle('');
    setDueDate('');
    setReminders([]);
    setReminderCustomized(false);
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetForm();
    onOpenChange(v);
  }

  function handleDueChange(newDueISO: string) {
    setDueDate(newDueISO);
    if (!newDueISO) {
      setReminders([]);
      return;
    }
    // Nếu user đã tuỳ chỉnh reminders, hỏi trước khi đè - tránh mất công sửa.
    if (reminderCustomized && reminders.length > 0) {
      const keep = confirm('Bạn đã tuỳ chỉnh nhắc nhở. Cập nhật lại theo hạn mới? (Huỷ để giữ nguyên)');
      if (!keep) return;
    }
    setReminders(computeDefaultReminders(new Date(newDueISO)));
    setReminderCustomized(false);
  }

  const canSubmit = useMemo(() => {
    if (!taskTitle.trim()) return false;
    if (!dueDate) return false;
    return true;
  }, [taskTitle, dueDate]);

  async function handleSubmit() {
    if (!user) {
      toast.error('Chưa đăng nhập');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/tasks', {
        title: taskTitle.trim(),
        entityType: 'LEAD',
        entityId: leadId,
        assignedTo: String(user.id),
        dueDate: new Date(dueDate).toISOString(),
        reminders: reminders.map(r => ({
          remindAt: new Date(r.remindAt).toISOString(),
          label: r.label,
        })),
      });
      toast.success('Đã tạo công việc');
      resetForm();
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Lỗi tạo công việc');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" data-testid="lead-quick-task-dialog">
        <DialogHeader>
          <DialogTitle>
            Đặt lịch cho lead{leadName ? `: ${leadName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/30 p-3">
          <div>
            <label className="text-xs text-slate-600">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <Input
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              maxLength={200}
              placeholder="Tên công việc"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-slate-600">
              Hạn <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={toInputValue(dueDate)}
              onChange={e => handleDueChange(fromInputValue(e.target.value))}
              required
              min={toInputValue(new Date().toISOString())}
              data-testid="task-due-date"
            />
          </div>

          <ReminderList
            dueDate={dueDate}
            reminders={reminders}
            onChange={r => {
              setReminders(r);
              setReminderCustomized(true);
            }}
            maxReminders={5}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            data-testid="lead-quick-task-submit"
          >
            {submitting ? 'Đang tạo...' : 'Tạo công việc'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
