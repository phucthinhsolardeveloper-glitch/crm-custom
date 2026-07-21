'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { settingsNameSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { Pencil, Trash2, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsItem } from '@/types/entities';

interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'color' | 'checkbox' | 'select';
  required?: boolean;
  placeholder?: string;
  /** Chỉ dùng cho type 'select'. Value luôn là chuỗi; '' đại diện cho null (tri-state). */
  options?: { value: string; label: string }[];
}

interface ColumnConfig {
  key: string;
  label: string;
  className?: string;
  /** Custom cell render; mặc định in thẳng item[key]. */
  render?: (item: SettingsItem) => React.ReactNode;
}

interface SettingsCrudTableProps {
  data: SettingsItem[];
  endpoint: string;
  entityName: string;
  fields: FieldConfig[];
  columns: ColumnConfig[];
  canEdit: boolean;
  onMutate?: () => void;
  /** Extra fields merged vào mọi create/update body (vd { sourceId }). */
  extraBody?: Record<string, unknown>;
  pageSize?: number;
  /** Bật cột checkbox chọn nhiều dòng. Mặc định tắt -> các bảng settings khác không đổi. */
  selectable?: boolean;
  /** Render thanh bulk action khi có dòng được chọn (vd nút "Đổi nguồn"). */
  renderBulkBar?: (selectedIds: string[], clear: () => void) => React.ReactNode;
}

/**
 * Bảng CRUD cho settings entity - có ô tìm kiếm + phân trang client-side.
 * Bản nâng cấp giao diện của SettingsCrudList (dạng row mỏng), dùng riêng cho trang Nguồn.
 */
export function SettingsCrudTable({
  data, endpoint, entityName, fields, columns, canEdit, onMutate, extraBody, pageSize = 10,
  selectable = false, renderBulkBar,
}: SettingsCrudTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SettingsItem | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { execute, isLoading } = useFormAction({ successMessage: `${entityName} đã được lưu` });
  const deleteAction = useFormAction({ successMessage: `Đã xóa ${entityName.toLowerCase()}` });

  // Lọc theo tên + mô tả (không phân biệt hoa thường).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) =>
      String(item.name ?? '').toLowerCase().includes(q) ||
      String(item.description ?? '').toLowerCase().includes(q),
    );
  }, [data, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const showSearch = data.length > pageSize;

  // Bỏ chọn khi data đổi (sau refresh) hoặc khi đổi bộ lọc - tránh giữ id không còn hiển thị.
  useEffect(() => { setSelectedIds(new Set()); }, [data]);

  function clearSelection() { setSelectedIds(new Set()); }
  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  // Chọn/bỏ tất cả các dòng đang hiển thị sau khi lọc (toàn bộ filtered, không chỉ trang hiện tại).
  const allFilteredSelected = filtered.length > 0 && filtered.every((it) => selectedIds.has(it.id));
  function toggleAll() {
    setSelectedIds(() => (allFilteredSelected ? new Set() : new Set(filtered.map((it) => it.id))));
  }

  function openCreate() {
    setEditingItem(null);
    const defaults: Record<string, unknown> = {};
    fields.forEach(f => { defaults[f.key] = f.type === 'checkbox' ? false : (f.type === 'color' ? '#6b7280' : ''); });
    setFormData(defaults);
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(item: SettingsItem) {
    setEditingItem(item);
    const values: Record<string, unknown> = {};
    fields.forEach(f => {
      // Select tri-state: boolean|null -> chuỗi cho <select> ('' = null/kế thừa).
      if (f.type === 'select') {
        const raw = item[f.key];
        values[f.key] = raw === true ? 'true' : raw === false ? 'false' : '';
      } else {
        values[f.key] = item[f.key] ?? '';
      }
    });
    setFormData(values);
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleSubmit() {
    const nameField = fields.find(f => f.key === 'name' && f.required);
    if (nameField) {
      const parsed = settingsNameSchema.safeParse({ name: formData['name'] });
      if (!parsed.success) { setFieldErrors(parseZodErrors(parsed.error)); return; }
    }
    setFieldErrors({});
    const body: Record<string, unknown> = { ...extraBody };
    fields.forEach(f => {
      const val = formData[f.key];
      if (f.type === 'checkbox') body[f.key] = !!val;
      // Select tri-state: gửi cả null ('' -> null = kế thừa) nên KHÔNG skip khi rỗng.
      else if (f.type === 'select') body[f.key] = val === 'true' ? true : val === 'false' ? false : null;
      else if (val !== '' && val !== undefined) body[f.key] = f.type === 'number' ? Number(val) : val;
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header: tên + đếm + tìm kiếm + nút thêm */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold text-slate-900">
          {entityName} <span className="text-slate-400 font-normal">({filtered.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Tìm kiếm..."
                className="h-9 w-48 pl-8 text-sm"
              />
            </div>
          )}
          {canEdit && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Thêm
            </Button>
          )}
        </div>
      </div>

      {/* Thanh bulk action - chỉ hiện khi bật selectable + có dòng được chọn */}
      {selectable && renderBulkBar && selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-2.5">
          <span className="text-sm font-semibold text-sky-700">Đã chọn {selectedIds.size} mục</span>
          <div className="flex items-center gap-2">
            {renderBulkBar([...selectedIds], clearSelection)}
            <Button variant="outline" size="sm" onClick={clearSelection}>Bỏ chọn</Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          {query ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có dữ liệu'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                {selectable && (
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600"
                      aria-label="Chọn tất cả"
                    />
                  </th>
                )}
                {columns.map(col => (
                  <th key={col.key} className={cn('px-3 py-2.5', col.className)}>{col.label}</th>
                ))}
                {canEdit && <th className="px-3 py-2.5 w-24 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => (
                <tr
                  key={item.id}
                  className={cn(
                    'border-b border-slate-100 last:border-0 hover:bg-slate-50',
                    selectable && selectedIds.has(item.id) && 'bg-sky-50/70',
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleOne(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                        aria-label={`Chọn ${item.name}`}
                      />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={cn('px-3 py-3 text-slate-700 align-middle', col.className)}>
                      {col.render ? col.render(item) : (item[col.key] != null ? String(item[col.key]) : <span className="text-slate-300">-</span>)}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1">
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phân trang - chỉ hiện khi có nhiều hơn 1 trang */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-400">
            Trang {safePage}/{totalPages} - {filtered.length} mục
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={safePage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={safePage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {(f.options ?? []).map(opt => (
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
