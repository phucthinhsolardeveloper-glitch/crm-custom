'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TextCursorInput, Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api-client';

interface LeadFieldDefItem {
  id: string;
  key: string;
  label: string;
  type: string;
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  initialFields: LeadFieldDefItem[];
}

/**
 * CRUD trường tùy chỉnh lead (SUPER_ADMIN). v1 chỉ kiểu text.
 * Mã trường (key) bất biến sau khi tạo - giá trị lưu trong leads.metadata theo key.
 * Tắt trường = ẩn khỏi form/bảng, dữ liệu cũ giữ nguyên.
 */
export function LeadCustomFieldSettings({ initialFields }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState<LeadFieldDefItem[]>(initialFields);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeadFieldDefItem | null>(null);
  const [formKey, setFormKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setFormKey('');
    setFormLabel('');
    setFormSortOrder('0');
    setDialogOpen(true);
  }

  function openEdit(field: LeadFieldDefItem) {
    setEditing(field);
    setFormKey(field.key);
    setFormLabel(field.label);
    setFormSortOrder(String(field.sortOrder));
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formLabel.trim()) { toast.error('Nhập tên hiển thị'); return; }
    setSaving(true);
    try {
      if (editing) {
        const res = await api.patch<{ data: LeadFieldDefItem }>(
          `/lead-field-definitions/${editing.id}`,
          { label: formLabel.trim(), sortOrder: Number(formSortOrder) || 0 },
        );
        setFields(prev => prev.map(f => (f.id === editing.id ? res.data : f)));
        toast.success('Đã cập nhật trường');
      } else {
        const res = await api.post<{ data: LeadFieldDefItem }>('/lead-field-definitions', {
          key: formKey.trim().toLowerCase(),
          label: formLabel.trim(),
          sortOrder: Number(formSortOrder) || 0,
        });
        setFields(prev => [...prev, res.data]);
        toast.success('Đã tạo trường tùy chỉnh');
      }
      setDialogOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(field: LeadFieldDefItem) {
    try {
      const res = await api.patch<{ data: LeadFieldDefItem }>(
        `/lead-field-definitions/${field.id}`,
        { isActive: !field.isActive },
      );
      setFields(prev => prev.map(f => (f.id === field.id ? res.data : f)));
      toast.success(res.data.isActive ? 'Đã bật trường' : 'Đã tắt trường (dữ liệu cũ giữ nguyên)');
      router.refresh();
    } catch {
      toast.error('Thao tác thất bại');
    }
  }

  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <TextCursorInput size={18} className="text-sky-500" />
            Trường tùy chỉnh lead
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Thêm cột dữ liệu mới cho lead mà không cần sửa hệ thống. Trường hiện trong
            form tạo/sửa lead và có thể bật làm cột trong bảng leads. Kiểu dữ liệu: chữ (text).
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-1.5" />
          Thêm trường
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Tên hiển thị</th>
              <th className="px-4 py-2.5">Mã trường</th>
              <th className="px-4 py-2.5 text-center">Thứ tự</th>
              <th className="px-4 py-2.5 text-center">Trạng thái</th>
              <th className="px-4 py-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(field => (
              <tr key={field.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-800">{field.label}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{field.key}</td>
                <td className="px-4 py-2.5 text-center text-slate-500">{field.sortOrder}</td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => toggleActive(field)}
                    className={
                      field.isActive
                        ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
                        : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500'
                    }
                  >
                    {field.isActive ? 'Đang dùng' : 'Đã tắt'}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(field)}>
                    <Pencil size={14} />
                  </Button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Chưa có trường tùy chỉnh nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa trường tùy chỉnh' : 'Thêm trường tùy chỉnh'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Tên hiển thị</label>
              <Input
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                placeholder="Vd: Mã hợp đồng"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Mã trường</label>
              <Input
                value={formKey}
                onChange={e => setFormKey(e.target.value)}
                placeholder="vd: ma_hop_dong"
                disabled={!!editing}
                className={editing ? 'bg-slate-50 text-slate-500' : ''}
              />
              <p className="text-xs text-slate-400 mt-0.5">
                {editing
                  ? 'Mã trường không đổi được sau khi tạo (dữ liệu lưu theo mã này).'
                  : 'Chữ thường, số, gạch dưới; bắt đầu bằng chữ. Không đổi được sau khi tạo.'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Thứ tự hiển thị</label>
              <Input
                type="number"
                value={formSortOrder}
                onChange={e => setFormSortOrder(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
