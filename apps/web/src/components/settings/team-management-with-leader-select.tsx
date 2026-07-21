'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Plus, Pencil, Trash2, Crown, Users } from 'lucide-react';


interface Team {
  id: string; name: string;
  department?: { id: string; name: string };
  leader?: { id: string; name: string };
  _count?: { members: number };
}
interface Department { id: string; name: string; }
interface User { id: string; name: string; departmentId?: string; role?: string; }

interface Props {
  departments: Department[];
  users: User[];
  canEdit: boolean;
}

/** Team CRUD with department filter and leader assignment. */
export function TeamManagementWithLeaderSelect({ departments, users, canEdit }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDeptId, setFilterDeptId] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [deptId, setDeptId] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const query = filterDeptId ? `?departmentId=${filterDeptId}` : '';
    api.get<{ data: Team[] }>(`/teams${query}`)
      .then(res => setTeams(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterDeptId]);

  // Chỉ user role=LEADER mới được chọn làm trưởng nhóm (quyền giám sát dựa trên role).
  // Phải gán role "Trưởng nhóm" ở Quản lý NV trước rồi mới chọn được ở đây.
  const deptUsers = (deptId ? users.filter(u => u.departmentId === deptId) : users)
    .filter(u => u.role === 'LEADER');

  function openCreate() {
    setEditingId(null);
    setName('');
    setDeptId('');
    setLeaderId('');
    setDialogOpen(true);
  }

  function openEdit(t: Team) {
    setEditingId(t.id);
    setName(t.name);
    setDeptId(t.department?.id || '');
    setLeaderId(t.leader?.id || '');
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Nhập tên team'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const body: Record<string, unknown> = { name: name.trim() };
        if (leaderId) body.leaderId = leaderId;
        const res = await api.patch<{ data: Team }>(`/teams/${editingId}`, body);
        setTeams(prev => prev.map(t => t.id === editingId ? res.data : t));
      } else {
        if (!deptId) { toast.error('Chọn phòng ban'); setSaving(false); return; }
        const body: Record<string, unknown> = { name: name.trim(), departmentId: deptId };
        if (leaderId) body.leaderId = leaderId;
        const res = await api.post<{ data: Team }>('/teams', body);
        setTeams(prev => [...prev, res.data]);
      }
      toast.success('Đã lưu team');
      setDialogOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/teams/${id}`);
      setTeams(prev => prev.filter(t => t.id !== id));
      toast.success('Đã xóa team');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xóa');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Teams</h3>
        <div className="flex items-center gap-2">
          <Select value={filterDeptId} onValueChange={setFilterDeptId}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Tất cả phòng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả phòng</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Thêm</Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Đang tải...</p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có team nào</p>
      ) : (
        <div className="space-y-1">
          {teams.map(t => (
            <div key={t.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{t.name}</span>
                  {t.department && (
                    <span className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{t.department.name}</span>
                  )}
                </div>
                {t.leader && (
                  <div className="flex items-center gap-1 mt-0.5 ml-6">
                    <Crown className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-slate-500">Trưởng nhóm: {t.leader.name}</span>
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                  <ConfirmDialog
                    trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>}
                    title="Xóa team"
                    description={`Xóa "${t.name}"?`}
                    confirmLabel="Xóa"
                    onConfirm={() => handleDelete(t.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Sửa team' : 'Tạo team mới'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Tên team *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Sales Team A" className="mt-1" />
            </div>
            {!editingId && (
              <div>
                <label className="text-sm font-medium text-slate-700">Phòng ban *</label>
                <Select value={deptId} onValueChange={(v) => { setDeptId(v); setLeaderId(''); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn phòng ban" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700">Trưởng nhóm</label>
              <Select value={leaderId} onValueChange={setLeaderId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn trưởng nhóm" /></SelectTrigger>
                <SelectContent>
                  {deptUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {deptUsers.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Chưa có nhân viên nào có vai trò &quot;Trưởng nhóm&quot;{deptId ? ' trong phòng ban này' : ''}. Vào Quản lý NV gán role Trưởng nhóm trước.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
