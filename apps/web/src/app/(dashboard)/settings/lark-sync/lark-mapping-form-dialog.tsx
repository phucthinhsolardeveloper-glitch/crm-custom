'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import type { LarkMappingItem, LarkCatalogEntry, LarkPreset } from './lark-sync-client';

/** 1 dong field-map tren editor: [Ten cot Lark] <-> [CRM field]. */
interface FieldMapRow {
  larkCol: string;
  catalogKey: string;
}

interface Props {
  mapping?: LarkMappingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (saved: LarkMappingItem) => void;
  catalog: LarkCatalogEntry[];
  presets: LarkPreset[];
}

function toRows(fieldMap: Record<string, string>): FieldMapRow[] {
  return Object.entries(fieldMap).map(([larkCol, catalogKey]) => ({ larkCol, catalogKey }));
}

export function LarkMappingFormDialog({ mapping, open, onOpenChange, onSuccess, catalog, presets }: Props) {
  const isEdit = !!mapping;
  const [name, setName] = useState('');
  const [baseToken, setBaseToken] = useState('');
  const [tableId, setTableId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [rows, setRows] = useState<FieldMapRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mapping) {
      setName(mapping.name);
      setBaseToken(mapping.baseToken ?? '');
      setTableId(mapping.tableId);
      setEnabled(mapping.enabled);
      setRows(toRows(mapping.fieldMap || {}));
    } else {
      setName('');
      setBaseToken('');
      setTableId('');
      setEnabled(true);
      setRows([{ larkCol: '', catalogKey: '' }]);
    }
  }, [mapping, open]);

  /** "Tai mau": do ten + baseToken + tableId + fieldMap theo kenh preset. */
  const loadPreset = (preset: LarkPreset) => {
    if (!name.trim()) setName(preset.channelName);
    setBaseToken(preset.baseToken);
    setTableId(preset.tableId);
    setRows(toRows(preset.fieldMap));
    toast.success(`Đã tải mẫu "${preset.channelName}" (${Object.keys(preset.fieldMap).length} cột)`);
  };

  const updateRow = (index: number, patch: Partial<FieldMapRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên Lark Sync');
      return;
    }
    if (!tableId.trim()) {
      toast.error('Vui lòng nhập Table ID');
      return;
    }
    const validRows = rows.filter((r) => r.larkCol.trim() && r.catalogKey);
    if (validRows.length === 0) {
      toast.error('Cần ít nhất 1 dòng map cột');
      return;
    }
    const dupCols = validRows.map((r) => r.larkCol.trim()).filter((c, i, a) => a.indexOf(c) !== i);
    if (dupCols.length > 0) {
      toast.error(`Tên cột Lark bị trùng: ${[...new Set(dupCols)].join(', ')}`);
      return;
    }

    const fieldMap: Record<string, string> = {};
    for (const r of validRows) fieldMap[r.larkCol.trim()] = r.catalogKey;

    setSubmitting(true);
    try {
      const res = await api.post<{ data: LarkMappingItem }>('/lark-sync/mappings', {
        ...(mapping ? { id: mapping.id } : {}),
        name: name.trim(),
        baseToken: baseToken.trim() || null,
        tableId: tableId.trim(),
        fieldMap,
        enabled,
      });
      toast.success(isEdit ? 'Đã cập nhật Lark Sync' : 'Đã tạo Lark Sync');
      onSuccess(res.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi khi lưu mapping');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sửa Lark Sync' : 'Thêm Lark Sync mới'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tên Lark Sync *">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Kênh Ban le"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </Field>
            <Field label="Table ID *">
              <input
                required
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                placeholder="VD: tblYr0Hnjr3oaA3g"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </Field>
          </div>

          <Field label="Base token (để trống = dùng base mặc định trong .env)">
            <input
              value={baseToken}
              onChange={(e) => setBaseToken(e.target.value)}
              placeholder="Mặc định"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
            />
          </Field>

          {/* Nut "Tai mau" - do san baseToken + tableId + fieldMap cua cac kenh seed */}
          {presets.length > 0 && (
            <Field label="Tải mẫu (đổ sẵn Base + Table ID + cột của 6 kênh)">
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.channelName}
                    type="button"
                    onClick={() => loadPreset(p)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg"
                  >
                    <Download className="w-3 h-3" />
                    {p.channelName}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Field-map editor: [Ten cot Lark] <-> [CRM field] */}
          <Field label={`Ánh xạ cột (${rows.length} dòng) - cột công thức bên Lark KHÔNG cần map`}>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row.larkCol}
                    onChange={(e) => updateRow(i, { larkCol: e.target.value })}
                    placeholder="Tên cột Lark (đúng từng ký tự)"
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                  />
                  <span className="text-slate-400 text-xs shrink-0">←</span>
                  <select
                    value={row.catalogKey}
                    onChange={(e) => updateRow(i, { catalogKey: e.target.value })}
                    className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">- Chọn CRM field -</option>
                    {catalog.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded shrink-0"
                    title="Xoá dòng"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { larkCol: '', catalogKey: '' }])}
              className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm dòng
            </button>
          </Field>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="lark-mapping-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <label htmlFor="lark-mapping-enabled" className="text-sm text-slate-700">
              Bật đồng bộ cho Lark Sync này
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
