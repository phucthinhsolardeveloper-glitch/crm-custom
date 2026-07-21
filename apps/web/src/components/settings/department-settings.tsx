'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import type { SettingsItem } from '@/types/entities';

interface DepartmentSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function DepartmentSettings({ data, canEdit }: DepartmentSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/departments"
      entityName="Phòng ban"
      canEdit={canEdit}
      fields={[
        { key: 'name', label: 'Tên phòng ban', required: true, placeholder: 'VD: Phòng kinh doanh' },
      ]}
      renderItem={(item) => {
        const count = item._count as { users?: number } | undefined;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700">{item.name}</span>
            {count?.users !== undefined && (
              <span className="text-xs text-slate-400">({count.users} NV)</span>
            )}
          </div>
        );
      }}
    />
  );
}
