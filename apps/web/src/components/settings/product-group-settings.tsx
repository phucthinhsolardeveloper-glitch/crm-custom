'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { invalidateOrderCaches } from '@/components/orders/create-order-dialog';
import type { SettingsItem } from '@/types/entities';

interface ProductGroupSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function ProductGroupSettings({ data, canEdit }: ProductGroupSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/product-groups"
      entityName="Nhóm sản phẩm"
      canEdit={canEdit}
      onMutate={invalidateOrderCaches}
      fields={[
        { key: 'name', label: 'Tên nhóm sản phẩm', type: 'text', required: true },
      ]}
    />
  );
}
