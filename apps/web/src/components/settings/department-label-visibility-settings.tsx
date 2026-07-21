'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Tag, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api-client';
import type { LabelEntity, NamedEntity } from '@/types/entities';

interface DepartmentLabelConfigItem {
  departmentId: string;
  labelIds: string[];
}

interface Props {
  departments: NamedEntity[];
  labels: LabelEntity[];
  initialConfigs: DepartmentLabelConfigItem[];
}

/**
 * Cấu hình nhãn hiển thị theo phòng ban (SUPER_ADMIN).
 * Chỉ ảnh hưởng danh sách chip lọc nhãn trên bảng leads của USER/LEADER thuộc
 * phòng ban đó. Picker gán nhãn luôn hiển thị đầy đủ. Không tick nhãn nào
 * (config rỗng) = phòng ban thấy tất cả nhãn.
 */
export function DepartmentLabelVisibilitySettings({ departments, labels, initialConfigs }: Props) {
  const [configs, setConfigs] = useState<Map<string, Set<string>>>(
    () => new Map(initialConfigs.map(c => [c.departmentId, new Set(c.labelIds)])),
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const selectedSet = useMemo(
    () => configs.get(selectedDeptId) ?? new Set<string>(),
    [configs, selectedDeptId],
  );
  const hasConfig = selectedSet.size > 0;

  function toggleLabel(labelId: string) {
    setConfigs(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(selectedDeptId) ?? []);
      if (set.has(labelId)) set.delete(labelId);
      else set.add(labelId);
      next.set(selectedDeptId, set);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    setConfigs(prev => {
      const next = new Map(prev);
      next.set(selectedDeptId, checked ? new Set(labels.map(l => l.id)) : new Set());
      return next;
    });
  }

  async function handleSave() {
    if (!selectedDeptId) return;
    setSaving(true);
    try {
      await api.put(`/labels/department-config/${selectedDeptId}`, {
        labelIds: Array.from(selectedSet),
      });
      toast.success(
        hasConfig
          ? 'Đã lưu cấu hình nhãn cho phòng ban'
          : 'Đã xóa cấu hình - phòng ban thấy tất cả nhãn',
      );
    } catch {
      toast.error('Lưu cấu hình thất bại');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Tag size={18} className="text-sky-500" />
          Nhãn hiển thị theo phòng ban
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Chọn nhãn mà nhân viên/leader của phòng ban thấy ở thanh lọc nhãn trên bảng leads.
          Không chọn nhãn nào = phòng ban thấy tất cả. Việc gán nhãn cho lead vẫn dùng danh
          sách nhãn đầy đủ.
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
          {hasConfig
            ? `Đang giới hạn ${selectedSet.size}/${labels.length} nhãn`
            : 'Chưa cấu hình - phòng ban thấy tất cả nhãn'}
        </span>
      </div>

      {selectedDeptId && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <label className="flex items-center gap-2 pb-2 border-b border-slate-100 text-sm font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-sky-500"
              checked={labels.length > 0 && selectedSet.size === labels.length}
              onChange={(e) => selectAll(e.target.checked)}
            />
            Chọn tất cả
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {labels.map(label => (
              <label
                key={label.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-sky-500"
                  checked={selectedSet.has(label.id)}
                  onChange={() => toggleLabel(label.id)}
                />
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: label.color, color: label.textColor }}
                >
                  {label.name}
                </span>
              </label>
            ))}
            {labels.length === 0 && (
              <p className="text-sm text-slate-400 col-span-full">Chưa có nhãn nào.</p>
            )}
          </div>
        </div>
      )}

      <Button onClick={handleSave} disabled={saving || !selectedDeptId}>
        <Save size={16} className="mr-1.5" />
        {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
      </Button>
    </div>
  );
}
