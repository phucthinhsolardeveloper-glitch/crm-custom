'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import type { SettingsItem } from '@/types/entities';

interface EmployeeLevelSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function EmployeeLevelSettings({ data, canEdit }: EmployeeLevelSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/employee-levels"
      entityName="Cấp bậc"
      canEdit={canEdit}
      fields={[
        { key: 'name', label: 'Tên cấp bậc', required: true, placeholder: 'VD: Nhân viên' },
        { key: 'rank', label: 'Thứ hạng', type: 'number', required: true, placeholder: 'VD: 1' },
        { key: 'maxLeads', label: 'Giới hạn leads+KH (để trống = không giới hạn)', type: 'number', placeholder: 'VD: 50' },
      ]}
      renderItem={(item) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-700">{item.name}</span>
          <span className="text-xs text-slate-400">Rank: {String(item.rank ?? '')}</span>
          {Boolean(item.maxLeads) && <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Max: {String(item.maxLeads)}</span>}
        </div>
      )}
    />
  );
}
