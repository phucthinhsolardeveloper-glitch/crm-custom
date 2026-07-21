'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { settingsNameSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { Pencil, Trash2, Plus } from 'lucide-react';
import type { SettingsItem } from '@/types/entities';

interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'color' | 'checkbox' | 'select';
  required?: boolean;
  placeholder?: string;
  /** Cho type 'select': danh sách lựa chọn. */
  options?: { value: string; label: string }[];
  /** Cho type 'color': khi tạo mới, chọn 1 màu ngẫu nhiên từ palette thay vì màu xám mặc định. */
  randomColorDefault?: boolean;
  /** Cho type 'checkbox': giá trị mặc định khi tạo mới (vd isActive nên bật sẵn). */
  defaultChecked?: boolean;
}

/** Palette màu pastel cho nhãn random (đủ tương phản với chữ trắng/đen badge). */
const RANDOM_LABEL_COLORS = [
  '#0ea5e9', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#ef4444', '#6366f1', '#14b8a6', '#f97316',
];
function pickRandomColor(): string {
  return RANDOM_LABEL_COLORS[Math.floor(Math.random() * RANDOM_LABEL_COLORS.length)];
}

interface SettingsCrudListProps {
  data: SettingsItem[];
  endpoint: string;
  entityName: string;
  fields: FieldConfig[];
  canEdit: boolean;
  renderItem?: (item: SettingsItem) => React.ReactNode;
  onMutate?: () => void;
  /** Extra fields merged into mọi create/update body (vd { sourceId } cho nhóm nguồn). */
  extraBody?: Record<string, unknown>;
}

/** Generic CRUD list for settings entities with dialog-based create/edit/delete. */
export function SettingsCrudList({ data, endpoint, entityName, fields, canEdit, renderItem, onMutate, extraBody }: SettingsCrudListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SettingsItem | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { execute, isLoading } = useFormAction({ successMessage: `${entityName} đã được lưu` });
  const deleteAction = useFormAction({ successMessage: `Đã xóa ${entityName.toLowerCase()}` });

  function openCreate() {
    setEditingItem(null);
    const defaults: Record<string, unknown> = {};
    fields.forEach(f => {
      if (f.type === 'checkbox') defaults[f.key] = f.defaultChecked ?? false;
      else if (f.type === 'number') defaults[f.key] = '';
      else if (f.type === 'select') defaults[f.key] = f.options?.[0]?.value ?? '';
      else if (f.type === 'color') defaults[f.key] = f.randomColorDefault ? pickRandomColor() : '#6b7280';
      else defaults[f.key] = '';
    });
    setFormData(defaults);
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(item: SettingsItem) {
    setEditingItem(item);
    const values: Record<string, unknown> = {};
    fields.forEach(f => { values[f.key] = item[f.key] ?? ''; });
    setFormData(values);
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleSubmit() {
    // Validate required name field if present
    const nameField = fields.find(f => f.key === 'name' && f.required);
    if (nameField) {
      const parsed = settingsNameSchema.safeParse({ name: formData['name'] });
      if (!parsed.success) {
        setFieldErrors(parseZodErrors(parsed.error));
        return;
      }
    }
    setFieldErrors({});
    const body: Record<string, unknown> = { ...extraBody };
    fields.forEach(f => {
      const val = formData[f.key];
      if (f.type === 'checkbox') {
        body[f.key] = !!val;
      } else if (val !== '' && val !== undefined) {
        body[f.key] = f.type === 'number' ? Number(val) : val;
      }
    });

    const result = editingItem
      ? await execute('patch', `${endpoint}/${editingItem.id}`, body)
      : await execute('post', endpoint, body);

    if (result) { setDialogOpen(false); onMutate?.(); }
  }

  async function handleDelete(id: string) {
    await deleteAction.execute('delete', `${endpoint}/${id}`);
    onMutate?.();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{entityName} ({data.length})</h3>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm
          </Button>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có dữ liệu</p>
      ) : (
        <div className="space-y-1">
          {data.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
              <div className="flex-1">
                {renderItem ? renderItem(item) : (
                  <span className="text-sm text-slate-700">{item.name}</span>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    }
                    title={`Xóa ${entityName.toLowerCase()}`}
                    description={`Bạn có chắc muốn xóa "${item.name}"? Hành động này không thể hoàn tác.`}
                    confirmLabel="Xóa"
                    onConfirm={() => handleDelete(item.id)}
                    isLoading={deleteAction.isLoading}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? `Sửa ${entityName.toLowerCase()}` : `Thêm ${entityName.toLowerCase()}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {fields.map(f => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  {f.label}
                  {f.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                {f.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formData[f.key]}
                      onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600"
                    />
                    <span className="text-sm text-slate-600">{f.placeholder || 'Bật'}</span>
                  </label>
                ) : f.type === 'select' ? (
                  <select
                    value={(formData[f.key] as string | undefined) ?? ''}
                    onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {f.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={f.type === 'color' ? 'color' : f.type === 'number' ? 'number' : 'text'}
                    placeholder={f.placeholder}
                    value={(formData[f.key] as string | number | undefined) ?? ''}
                    onChange={e => {
                      setFormData(prev => ({ ...prev, [f.key]: e.target.value }));
                      if (fieldErrors[f.key]) setFieldErrors(prev => ({ ...prev, [f.key]: '' }));
                    }}
                    className={f.type === 'color' ? 'h-10 w-20 p-1' : undefined}
                  />
                )}
                {fieldErrors[f.key] && <p className="text-xs text-red-500">{fieldErrors[f.key]}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
