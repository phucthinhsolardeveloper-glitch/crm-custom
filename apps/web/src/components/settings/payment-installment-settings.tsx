'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { invalidateOrderCaches } from '@/components/orders/create-order-dialog';
import type { SettingsItem } from '@/types/entities';

interface PaymentInstallmentSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function PaymentInstallmentSettings({ data, canEdit }: PaymentInstallmentSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/payment-installments"
      entityName="Lần CK"
      canEdit={canEdit}
      onMutate={invalidateOrderCaches}
      fields={[
        { key: 'name', label: 'Tên lần CK', type: 'text', required: true },
      ]}
    />
  );
}
