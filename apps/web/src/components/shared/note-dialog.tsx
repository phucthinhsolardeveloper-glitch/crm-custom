'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import ReminderList, { computeDefaultReminders, type ReminderItem } from '@/components/shared/reminder-list';

// --- Timezone helpers ---

function toInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputValue(v: string): string {
  return v ? new Date(v).toISOString() : '';
}

// --- Types ---

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: 'lead' | 'customer';
  entityId: string | bigint;
  onSuccess?: () => void;
}

// --- Component ---

export default function NoteDialog({ open, onOpenChange, entityType, entityId, onSuccess }: NoteDialogProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [noteText, setNoteText] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [reminderCustomized, setReminderCustomized] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setNoteText('');
    setCreateTask(false);
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
    if (reminderCustomized && reminders.length > 0) {
      const keep = confirm('Bạn đã tuỳ chỉnh nhắc nhở. Cập nhật lại theo hạn mới? (Huỷ để giữ nguyên)');
      if (!keep) return;
    }
    setReminders(computeDefaultReminders(new Date(newDueISO)));
    setReminderCustomized(false);
  }

  const canSubmit = useMemo(() => {
    if (!noteText.trim()) return false;
    if (createTask) {
      if (!taskTitle.trim()) return false;
      if (!dueDate) return false;
    }
    return true;
  }, [noteText, createTask, taskTitle, dueDate]);

  async function handleSubmit() {
    setSubmitting(true);
    const activityUrl = `/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`;

    // Step 1 - note. If this fails, bail.
    try {
      await api.post(activityUrl, { type: 'NOTE', content: noteText.trim() });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message ?? 'Không thể thêm ghi chú');
      setSubmitting(false);
      return;
    }

    // Step 2 - task (optional). Note already persisted; surface partial-success explicitly.
    if (createTask && user) {
      try {
        await api.post('/tasks', {
          title: taskTitle.trim(),
          description: noteText.trim(),
          entityType: entityType.toUpperCase(),
          entityId: String(entityId),
          assignedTo: String(user.id),
          dueDate: new Date(dueDate).toISOString(),
          reminders: reminders.map(r => ({
            remindAt: new Date(r.remindAt).toISOString(),
            label: r.label,
          })),
        });
        toast.success('Đã thêm ghi chú và tạo công việc');
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        toast.warning(
          `Đã thêm ghi chú nhưng tạo công việc lỗi: ${err?.response?.data?.message ?? 'Lỗi không xác định'}. Bạn có thể tạo lại công việc riêng.`,
        );
        // Still consider the flow "done" so the dialog closes - user knows status
      }
    } else {
      toast.success('Đã thêm ghi chú');
    }

    resetForm();
    onSuccess?.();
    onOpenChange(false);
    setSubmitting(false);
    // Server Component page - must refresh to re-fetch SSR data (no TanStack Query cache here).
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" data-testid="note-dialog">
        <DialogHeader>
          <DialogTitle>Thêm ghi chú</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={noteText}
            onChange={e => {
              setNoteText(e.target.value);
              if (createTask && !taskTitle) {
                setTaskTitle(e.target.value.slice(0, 50));
              }
            }}
            placeholder="Nội dung ghi chú..."
            rows={4}
            autoFocus
          />

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={createTask}
              onChange={e => setCreateTask(e.target.checked)}
              className="rounded"
              data-testid="create-task-checkbox"
            />
            Tạo công việc từ ghi chú này
          </label>

          {createTask && (
            <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/30 p-3">
              <div>
                <label className="text-xs text-slate-600">Tiêu đề</label>
                <Input
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Tên công việc"
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Huỷ</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            data-testid="note-dialog-submit"
          >
            {submitting ? 'Đang xử lý...' : 'Thêm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
