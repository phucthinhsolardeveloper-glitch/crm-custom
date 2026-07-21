'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { invalidateOrderCaches } from '@/components/orders/create-order-dialog';
import type { SettingsItem } from '@/types/entities';

interface PaymentTypeSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function PaymentTypeSettings({ data, canEdit }: PaymentTypeSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/payment-types"
      entityName="Loại thanh toán"
      canEdit={canEdit}
      onMutate={invalidateOrderCaches}
      fields={[
        { key: 'name', label: 'Tên loại', required: true, placeholder: 'VD: CK lần 1' },
        { key: 'description', label: 'Mô tả', placeholder: 'Mô tả loại thanh toán' },
      ]}
    />
  );
}
