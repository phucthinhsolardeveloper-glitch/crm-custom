'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { LarkMappingFormDialog } from './lark-mapping-form-dialog';

export interface LarkMappingItem {
  id: string;
  name: string;
  baseToken: string | null;
  tableId: string;
  fieldMap: Record<string, string>;
  enabled: boolean;
}

export interface LarkCatalogEntry {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date';
}

export interface LarkPreset {
  channelName: string;
  baseToken: string;
  tableId: string;
  fieldMap: Record<string, string>;
}

interface Props {
  initialMappings: LarkMappingItem[];
  catalog: LarkCatalogEntry[];
  presets: LarkPreset[];
}

/** Danh sach duong ong Lark doc lap + nut tao/sua/xoa/bat-tat. */
export function LarkSyncClient({ initialMappings, catalog, presets }: Props) {
  const [mappings, setMappings] = useState<LarkMappingItem[]>(initialMappings);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LarkMappingItem | null>(null);

  const handleSaved = (saved: LarkMappingItem) => {
    setMappings((prev) => {
      const idx = prev.findIndex((m) => m.id === saved.id);
      if (idx >= 0) return prev.map((m, i) => (i === idx ? saved : m));
      return [...prev, saved];
    });
    setEditing(null);
  };

  const handleToggle = async (mapping: LarkMappingItem) => {
    try {
      const res = await api.post<{ data: LarkMappingItem }>('/lark-sync/mappings', {
        id: mapping.id,
        name: mapping.name,
        baseToken: mapping.baseToken,
        tableId: mapping.tableId,
        fieldMap: mapping.fieldMap,
        enabled: !mapping.enabled,
      });
      handleSaved(res.data);
      toast.success(res.data.enabled ? 'Đã bật đồng bộ' : 'Đã tắt đồng bộ');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi cập nhật');
    }
  };

  const handleDelete = async (mapping: LarkMappingItem) => {
    if (!confirm(`Xoá Lark Sync "${mapping.name}"? Đơn mới chọn Lark Sync này sẽ không đẩy sang Lark nữa.`)) {
      return;
    }
    try {
      await api.delete(`/lark-sync/mappings/${mapping.id}`);
      setMappings((prev) => prev.filter((m) => m.id !== mapping.id));
      toast.success(`Đã xoá Lark Sync "${mapping.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xoá Lark Sync');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-800">Lark Sync ({mappings.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Mỗi Lark Sync trỏ tới 1 bảng Lark. Đơn hàng chọn Lark Sync khi tạo.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Thêm Lark Sync
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-bold text-slate-500 uppercase">
              <th className="px-5 py-3">Tên Lark Sync</th>
              <th className="px-5 py-3">Base</th>
              <th className="px-5 py-3">Table ID</th>
              <th className="px-5 py-3 w-20">Số cột</th>
              <th className="px-5 py-3 w-28">Trạng thái</th>
              <th className="px-5 py-3 w-36 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-sm">
                  Chưa có Lark Sync nào. Bấm <strong>+ Thêm Lark Sync</strong>, đặt tên rồi dùng
                  nút <strong>Tải mẫu</strong> để đổ sẵn cấu hình các kênh.
                </td>
              </tr>
            )}
            {mappings.map((m) => (
              <tr key={m.id} className={`border-t border-slate-100 hover:bg-sky-50/30 ${!m.enabled ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3 font-semibold text-slate-700">
                  {m.name}
                </td>
                <td className="px-5 py-3">
                  {m.baseToken ? (
                    <code className="text-xs text-slate-600">{m.baseToken}</code>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Mặc định (.env)</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <code className="text-xs text-slate-600">{m.tableId}</code>
                </td>
                <td className="px-5 py-3 text-slate-600">{Object.keys(m.fieldMap || {}).length}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => handleToggle(m)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      m.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                    title="Bấm để bật/tắt"
                  >
                    {m.enabled ? 'Đang bật' : 'Đã tắt'}
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setEditing(m)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(m)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LarkMappingFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleSaved}
        catalog={catalog}
        presets={presets}
      />
      {editing && (
        <LarkMappingFormDialog
          mapping={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSuccess={handleSaved}
          catalog={catalog}
          presets={presets}
        />
      )}
    </div>
  );
}
