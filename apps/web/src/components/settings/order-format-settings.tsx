'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { invalidateOrderCaches } from '@/components/orders/create-order-dialog';
import type { SettingsItem } from '@/types/entities';

interface OrderFormatSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function OrderFormatSettings({ data, canEdit }: OrderFormatSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/order-formats"
      entityName="Hình thức"
      canEdit={canEdit}
      onMutate={invalidateOrderCaches}
      fields={[
        { key: 'name', label: 'Tên hình thức', type: 'text', required: true },
      ]}
    />
  );
}
