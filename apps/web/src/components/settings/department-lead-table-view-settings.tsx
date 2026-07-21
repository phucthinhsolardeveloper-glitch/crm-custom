'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LayoutList, Save, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { api } from '@/lib/api-client';
import {
  LEAD_TABLE_CONFIGURABLE_COLUMNS,
  CUSTOM_FIELD_COLUMN_PREFIX,
} from '@/components/leads/lead-table-excel';
import type { NamedEntity } from '@/types/entities';

interface DeptViewConfig {
  visible: Record<string, boolean>;
  order: string[];
}

interface DeptViewConfigItem {
  departmentId: string;
  config: DeptViewConfig;
}

interface Props {
  departments: NamedEntity[];
  initialConfigs: DeptViewConfigItem[];
  /** Trường tùy chỉnh active - hiện thành cột chọn được trong bố cục (key prefix cf_). */
  customFieldDefs?: { key: string; label: string }[];
}

/**
 * Thiết kế bố cục bảng leads cố định theo phòng ban (SUPER_ADMIN).
 * Khóa visibility + order cho USER/LEADER thuộc phòng ban; width + kiểu chữ
 * vẫn là tùy chỉnh cá nhân. Xóa cấu hình = phòng ban tự do như cũ.
 */
export function DepartmentLeadTableViewSettings({ departments, initialConfigs, customFieldDefs = [] }: Props) {
  const [configs, setConfigs] = useState<Map<string, DeptViewConfig>>(
    () => new Map(initialConfigs.map(c => [c.departmentId, c.config])),
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Catalog = cột built-in + cột trường tùy chỉnh (cf_<key>) - khớp buildLeadColumns.
  const allKeys = useMemo(
    () => [
      ...LEAD_TABLE_CONFIGURABLE_COLUMNS,
      ...customFieldDefs.map(d => ({ key: CUSTOM_FIELD_COLUMN_PREFIX + d.key, label: d.label })),
    ],
    [customFieldDefs],
  );
  const labelOf = useMemo(
    () => new Map(allKeys.map(c => [c.key, c.label])),
    [allKeys],
  );

  const saved = configs.get(selectedDeptId);
  // Draft đang chỉnh: order đầy đủ mọi key (config cũ thiếu key mới -> append cuối).
  const [drafts, setDrafts] = useState<Map<string, DeptViewConfig>>(new Map());
  const draft = useMemo<DeptViewConfig>(() => {
    const existing = drafts.get(selectedDeptId) ?? saved;
    const baseOrder = existing?.order?.filter(k => labelOf.has(k)) ?? [];
    const missing = allKeys.map(c => c.key).filter(k => !baseOrder.includes(k));
    return {
      visible: { ...Object.fromEntries(allKeys.map(c => [c.key, true])), ...existing?.visible },
      order: [...baseOrder, ...missing],
    };
  }, [drafts, saved, selectedDeptId, allKeys, labelOf]);

  const hasSavedConfig = configs.has(selectedDeptId);

  function updateDraft(next: DeptViewConfig) {
    setDrafts(prev => new Map(prev).set(selectedDeptId, next));
  }

  function toggleColumn(key: string) {
    updateDraft({
      ...draft,
      visible: { ...draft.visible, [key]: !(draft.visible[key] ?? true) },
    });
  }

  function moveColumn(key: string, dir: -1 | 1) {
    const idx = draft.order.indexOf(key);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= draft.order.length) return;
    const next = [...draft.order];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateDraft({ ...draft, order: next });
  }

  async function handleSave() {
    if (!selectedDeptId) return;
    setSaving(true);
    try {
      await api.put(`/department-view-configs/${selectedDeptId}`, { config: draft });
      setConfigs(prev => new Map(prev).set(selectedDeptId, draft));
      toast.success('Đã lưu bố cục bảng cho phòng ban');
    } catch {
      toast.error('Lưu bố cục thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedDeptId) return;
    setDeleting(true);
    try {
      await api.delete(`/department-view-configs/${selectedDeptId}`);
      setConfigs(prev => {
        const next = new Map(prev);
        next.delete(selectedDeptId);
        return next;
      });
      setDrafts(prev => {
        const next = new Map(prev);
        next.delete(selectedDeptId);
        return next;
      });
      toast.success('Đã xóa cấu hình - phòng ban dùng bố cục tự do');
    } catch {
      toast.error('Xóa cấu hình thất bại');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <LayoutList size={18} className="text-sky-500" />
          Bố cục bảng leads theo phòng ban
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Cố định cột hiển thị và thứ tự cột cho nhân viên/leader của phòng ban.
          Nhân viên vẫn tự chỉnh được độ rộng cột và kiểu chữ. Phòng ban chưa có
          cấu hình thì mọi người tự do tùy chỉnh như bình thường. Quản lý và super
          admin không bị khóa.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Chọn phòng ban" />
          </SelectTrigger>
          <SelectContent>
            {departments.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500">
          {hasSavedConfig ? 'Đang áp dụng bố cục cố định' : 'Chưa cấu hình - bố cục tự do'}
        </span>
      </div>

      {selectedDeptId && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Tick cột hiển thị, dùng mũi tên đổi thứ tự (trên xuống = trái sang phải)
          </p>
          <div className="space-y-0.5">
            {draft.order.map((key, idx) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-sky-500"
                  checked={draft.visible[key] ?? true}
                  onChange={() => toggleColumn(key)}
                />
                <span className="flex-1 text-slate-700">{labelOf.get(key) ?? key}</span>
                <button
                  type="button"
                  onClick={() => moveColumn(key, -1)}
                  disabled={idx === 0}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                  aria-label={`Đưa cột ${labelOf.get(key) ?? key} lên`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveColumn(key, 1)}
                  disabled={idx === draft.order.length - 1}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                  aria-label={`Đưa cột ${labelOf.get(key) ?? key} xuống`}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !selectedDeptId}>
          <Save size={16} className="mr-1.5" />
          {saving ? 'Đang lưu...' : 'Lưu bố cục'}
        </Button>
        {hasSavedConfig && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={deleting}>
                <Trash2 size={16} className="mr-1.5 text-red-500" />
                Xóa cấu hình
              </Button>
            }
            title="Xóa bố cục cố định?"
            description="Phòng ban sẽ trở lại chế độ tự do - mỗi nhân viên tự tùy chỉnh cột."
            confirmLabel="Xóa"
            onConfirm={handleDelete}
            isLoading={deleting}
          />
        )}
      </div>
    </div>
  );
}
