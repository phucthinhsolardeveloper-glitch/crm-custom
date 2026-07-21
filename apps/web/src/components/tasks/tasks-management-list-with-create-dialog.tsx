'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { taskSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { Plus, CheckCircle2, XCircle, Circle, Clock, Pencil, Trash2, Link2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: string;
  remindAt?: string;
  entityType?: string;
  entityId?: string;
  assignedTo?: string;
  createdAt: string;
}

interface TaskForm {
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  remindAt: string;
  assignedTo: string;
}

type FilterTab = 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Đang chờ',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const PRIORITY_LABEL: Record<string, string> = {
  HIGH: 'Cao',
  MEDIUM: 'TB',
  LOW: 'Thấp',
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-600',
  MEDIUM: 'bg-yellow-100 text-yellow-600',
  LOW: 'bg-slate-100 text-slate-500',
};

const TAB_LABELS: { value: FilterTab; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Đang chờ' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

function getPresetDate(preset: 'today' | 'tomorrow' | 'nextweek'): string {
  const d = new Date();
  if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
  if (preset === 'nextweek') {
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
  }
  d.setHours(23, 59, 0, 0);
  // Format as datetime-local value: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
}

const EMPTY_FORM: TaskForm = { title: '', description: '', dueDate: '', priority: '', remindAt: '', assignedTo: '' };

interface TaskListClientProps {
  initialTasks: Task[];
  meta?: { total?: number; page?: number; limit?: number; totalPages?: number };
}

export function TaskListClient({ initialTasks, meta }: TaskListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const activeTab: FilterTab = (searchParams.get('status') as FilterTab) ?? 'ALL';

  // Server đã lọc theo status + phân trang -> đồng bộ lại danh sách khi điều hướng tab/trang
  useEffect(() => { setTasks(initialTasks); }, [initialTasks]);

  /** Đổi tab trạng thái = điều hướng URL (server lọc + reset về trang 1). */
  function selectTab(tab: FilterTab) {
    const p = new URLSearchParams(searchParams.toString());
    if (tab === 'ALL') p.delete('status'); else p.set('status', tab);
    p.delete('page');
    p.delete('cursor');
    router.push(`?${p.toString()}`);
  }

  // Quick-add bar
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPreset, setQuickPreset] = useState<'today' | 'tomorrow' | 'nextweek' | ''>('');
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Users list for assignedTo
  const [usersList, setUsersList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get<{ data: { id: string; name: string }[] }>('/users').then(res => {
      const list: { id: string; name: string }[] = Array.isArray(res) ? (res as { id: string; name: string }[]) : (res as { data: { id: string; name: string }[] }).data ?? [];
      setUsersList(list.map((u) => ({ id: String(u.id), name: u.name })));
    }).catch(() => {});
  }, []);

  function openCreate() {
    setEditTask(null);
    setForm({ ...EMPTY_FORM, assignedTo: user ? String(user.id) : '' });
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 16) : '',
      priority: task.priority ?? '',
      remindAt: task.remindAt ? task.remindAt.slice(0, 16) : '',
      assignedTo: task.assignedTo ?? '',
    });
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleQuickAdd() {
    if (!quickTitle.trim()) {
      quickInputRef.current?.focus();
      return;
    }
    setQuickSubmitting(true);
    try {
      const body: Record<string, string> = { title: quickTitle.trim() };
      if (quickPreset) body.dueDate = new Date(getPresetDate(quickPreset)).toISOString();
      if (user) body.assignedTo = String(user.id);
      const res = await api.post<{ data: Task }>('/tasks', body);
      setTasks(prev => [res.data, ...prev]);
      setQuickTitle('');
      setQuickPreset('');
      toast.success('Đã tạo công việc');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tạo công việc');
    } finally {
      setQuickSubmitting(false);
    }
  }

  async function handleSave() {
    const parsed = taskSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parseZodErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const body: Record<string, string> = { title: form.title.trim() };
      if (form.description) body.description = form.description;
      if (form.dueDate) body.dueDate = new Date(form.dueDate).toISOString();
      if (form.priority) body.priority = form.priority;
      if (form.remindAt) body.remindAt = new Date(form.remindAt).toISOString();
      if (form.assignedTo) body.assignedTo = form.assignedTo;

      if (editTask) {
        const res = await api.patch<{ data: Task }>(`/tasks/${editTask.id}`, body);
        setTasks(prev => prev.map(t => t.id === editTask.id ? { ...t, ...res.data } : t));
        toast.success('Đã cập nhật công việc');
      } else {
        const res = await api.post<{ data: Task }>('/tasks', body);
        setTasks(prev => [res.data, ...prev]);
        toast.success('Đã tạo công việc');
      }
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi lưu công việc');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(id: string) {
    try {
      await api.post(`/tasks/${id}/complete`);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'COMPLETED' } : t));
      toast.success('Đã hoàn thành công việc');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật');
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.post(`/tasks/${id}/cancel`);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'CANCELLED' } : t));
      toast.success('Đã hủy công việc');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi hủy công việc');
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
      toast.success('Đã xóa công việc');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xóa công việc');
    }
  }

  function getEntityLink(task: Task) {
    if (!task.entityType || !task.entityId) return null;
    if (task.entityType === 'LEAD') return `/leads/${task.entityId}`;
    if (task.entityType === 'CUSTOMER') return `/customers/${task.entityId}`;
    return null;
  }

  function isOverdue(task: Task) {
    return task.status === 'PENDING' && !!task.dueDate && new Date(task.dueDate) < new Date();
  }

  return (
    <div>
      {/* Quick-add bar */}
      <div className="flex items-center gap-2 mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <Input
          ref={quickInputRef}
          className="flex-1 border-0 shadow-none focus-visible:ring-0 text-sm"
          placeholder="Thêm nhanh công việc..."
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
        />
        {(['today', 'tomorrow', 'nextweek'] as const).map((p, i) => {
          const labels = ['Hôm nay', 'Ngày mai', 'Tuần sau'];
          return (
            <button
              key={p}
              type="button"
              onClick={() => setQuickPreset(prev => prev === p ? '' : p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
                quickPreset === p
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {labels[i]}
            </button>
          );
        })}
        <Button
          size="sm"
          onClick={handleQuickAdd}
          disabled={quickSubmitting}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Filter tabs + advanced create */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {TAB_LABELS.map(tab => (
            <button
              key={tab.value}
              onClick={() => selectTab(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-white text-sky-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />Tạo chi tiết
        </Button>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTask ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Tiêu đề *</label>
              <Input
                className="mt-1"
                placeholder="Nhập tiêu đề công việc..."
                value={form.title}
                onChange={e => {
                  setForm(f => ({ ...f, title: e.target.value }));
                  if (fieldErrors.title) setFieldErrors(prev => ({ ...prev, title: '' }));
                }}
              />
              {fieldErrors.title && <p className="text-xs text-red-500 mt-1">{fieldErrors.title}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Mô tả</label>
              <Input
                className="mt-1"
                placeholder="Mô tả chi tiết (tùy chọn)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Hạn hoàn thành</label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={form.dueDate}
                onChange={e => {
                  setForm(f => ({ ...f, dueDate: e.target.value }));
                  if (fieldErrors.dueDate) setFieldErrors(prev => ({ ...prev, dueDate: '' }));
                }}
              />
              {fieldErrors.dueDate && <p className="text-xs text-red-500 mt-1">{fieldErrors.dueDate}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Độ ưu tiên</label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Chọn độ ưu tiên" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Thấp</SelectItem>
                  <SelectItem value="MEDIUM">Trung bình</SelectItem>
                  <SelectItem value="HIGH">Cao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Nhắc nhở</label>
              <Input
                type="datetime-local"
                className="mt-1"
                value={form.remindAt}
                onChange={e => setForm(f => ({ ...f, remindAt: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Giao cho</label>
              <Select value={form.assignedTo} onValueChange={v => setForm(f => ({ ...f, assignedTo: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Chọn người thực hiện" />
                </SelectTrigger>
                <SelectContent>
                  {usersList.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
              <Button onClick={handleSave} disabled={submitting}>
                {submitting ? 'Đang lưu...' : editTask ? 'Lưu thay đổi' : 'Tạo công việc'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
            Không có công việc nào
          </div>
        ) : (
          tasks.map(task => {
            const entityLink = getEntityLink(task);
            const overdue = isOverdue(task);
            return (
              <div
                key={task.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {task.status === 'COMPLETED' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : task.status === 'CANCELLED' ? (
                      <XCircle className="h-5 w-5 text-slate-400" />
                    ) : (
                      <Circle className="h-5 w-5 text-sky-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => openEdit(task)}
                      className={`font-medium text-left truncate block w-full hover:text-sky-600 transition-colors ${
                        task.status === 'COMPLETED' ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {task.title}
                    </button>
                    {task.description && (
                      <p className="text-sm text-slate-500 truncate">{task.description}</p>
                    )}
                    <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-slate-400">
                      {task.dueDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(task.dueDate)}
                        </span>
                      )}
                      {overdue && (
                        <span className="rounded-full bg-red-100 text-red-600 px-2 py-0.5 font-medium">
                          Quá hạn
                        </span>
                      )}
                      {task.priority && (
                        <span className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_COLORS[task.priority]}`}>
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                      )}
                      {entityLink ? (
                        <a
                          href={entityLink}
                          className="flex items-center gap-1 text-sky-500 hover:text-sky-700"
                          onClick={e => e.stopPropagation()}
                        >
                          <Link2 className="h-3 w-3" />
                          {task.entityType} #{task.entityId}
                        </a>
                      ) : task.entityType ? (
                        <span className="text-sky-500">{task.entityType} #{task.entityId}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status]}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  {task.status === 'PENDING' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                        onClick={() => handleComplete(task.id)}
                      >
                        Hoàn thành
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => handleCancel(task.id)}
                      >
                        Hủy
                      </Button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(task)}
                    className="p-1 rounded text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    }
                    title="Xóa công việc"
                    description={`Bạn có chắc muốn xóa công việc "${task.title}"?`}
                    confirmLabel="Xóa"
                    onConfirm={() => handleDelete(task.id)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
