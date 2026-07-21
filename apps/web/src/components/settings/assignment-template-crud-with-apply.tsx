'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Plus, Pencil, Trash2, Play, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface User { id: string; name: string; departmentId?: string; }
interface Department { id: string; name: string; }
interface Template {
  id: string; name: string; strategy: string; isActive: boolean;
  members: { user: { id: string; name: string } }[];
}

interface Props {
  users: User[];
  departments: Department[];
}

/** Assignment template CRUD + apply - round-robin manual distribution. */
export function AssignmentTemplateCrudWithApply({ users, departments }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Filter users by selected department
  const filteredUsers = selectedDeptId
    ? users.filter(u => u.departmentId === selectedDeptId)
    : users;

  // Apply state
  const [applyId, setApplyId] = useState<string | null>(null);
  const [poolLeads, setPoolLeads] = useState<{ id: string }[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.get<{ data: Template[] }>('/assignment-templates')
      .then(res => setTemplates(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setName('');
    setSelectedDeptId('');
    setSelectedUserIds(new Set());
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setName(t.name);
    setSelectedDeptId('');
    setSelectedUserIds(new Set(t.members.map(m => m.user.id)));
    setDialogOpen(true);
  }

  function toggleUser(userId: string) {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Vui lòng nhập tên template'); return; }
    if (selectedUserIds.size === 0) { toast.error('Chọn ít nhất 1 nhân viên'); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), strategy: 'ROUND_ROBIN', memberUserIds: Array.from(selectedUserIds) };
      if (editingId) {
        const res = await api.patch<{ data: Template }>(`/assignment-templates/${editingId}`, body);
        setTemplates(prev => prev.map(t => t.id === editingId ? res.data : t));
      } else {
        const res = await api.post<{ data: Template }>('/assignment-templates', body);
        setTemplates(prev => [...prev, res.data]);
      }
      toast.success('Đã lưu template');
      setDialogOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi lưu template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/assignment-templates/${id}`);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Đã xóa template');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xóa');
    }
  }

  async function openApply(templateId: string) {
    setApplyId(templateId);
    try {
      const res = await api.get<{ data: { id: string }[] }>('/leads/pool/new?limit=100');
      setPoolLeads(res.data || []);
    } catch {
      setPoolLeads([]);
    }
  }

  async function handleApply() {
    if (!applyId || poolLeads.length === 0) return;
    setApplying(true);
    try {
      const res = await api.post<{ data: { assigned: number } }>(
        `/assignment-templates/${applyId}/apply`,
        { leadIds: poolLeads.map(l => l.id) },
      );
      toast.success(`Đã phân phối ${res.data?.assigned ?? 0} leads theo template`);
      setApplyId(null);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi phân phối');
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-400">Đang tải...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Template phân phối thủ công</h3>
          <p className="text-xs text-slate-500">Round-robin: chia đều leads cho danh sách nhân viên</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Tạo template</Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          Chưa có template nào. Tạo template để phân phối leads nhanh.
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  <Users className="inline h-3 w-3 mr-1" />
                  {t.members?.map(m => m.user.name).join(', ') || 'Chưa có thành viên'}
                  <span className="mx-1">·</span>
                  {t.strategy === 'ROUND_ROBIN' ? 'Round-robin' : t.strategy}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => openApply(t.id)} title="Áp dụng">
                  <Play className="h-3.5 w-3.5 mr-1" />Phân phối
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)}>
                  <Pencil className="h-3.5 w-3.5 text-slate-400" />
                </Button>
                <ConfirmDialog
                  trigger={<Button size="icon" variant="ghost" className="h-8 w-8"><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>}
                  title="Xóa template"
                  description={`Xóa "${t.name}"? Hành động không thể hoàn tác.`}
                  confirmLabel="Xóa"
                  onConfirm={() => handleDelete(t.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Sửa template' : 'Tạo template phân phối'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Tên template</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Team Sales A" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Phòng ban</label>
              <Select value={selectedDeptId} onValueChange={(v) => { setSelectedDeptId(v); setSelectedUserIds(new Set()); }}>
                <SelectTrigger><SelectValue placeholder="Chọn phòng ban" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDeptId && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Chọn nhân viên ({selectedUserIds.size}/{filteredUsers.length} đã chọn)
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds(new Set(filteredUsers.map(u => u.id)))}
                    className="ml-2 text-xs text-sky-600 hover:underline"
                  >Chọn tất cả</button>
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {filteredUsers.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2">Không có nhân viên trong phòng ban này</p>
                  ) : filteredUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => toggleUser(u.id)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span className="text-sm text-slate-700">{u.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply confirm dialog */}
      <Dialog open={!!applyId} onOpenChange={(v) => { if (!v) setApplyId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân phối leads theo template</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-slate-600">
              Sẽ phân phối <span className="font-semibold text-sky-600">{poolLeads.length} leads</span> từ
              Kho Mới cho nhân viên trong template theo round-robin.
            </p>
            {poolLeads.length === 0 && (
              <p className="mt-2 text-sm text-amber-600">Không có leads nào trong Kho Mới để phân phối.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyId(null)}>Hủy</Button>
            <Button onClick={handleApply} disabled={applying || poolLeads.length === 0}>
              {applying ? 'Đang phân phối...' : `Phân phối ${poolLeads.length} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
