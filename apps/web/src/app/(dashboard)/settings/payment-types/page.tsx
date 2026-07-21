import { serverFetch, getCurrentUser } from '@/lib/auth';
import { PaymentTypeSettings } from '@/components/settings/payment-type-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Loại thanh toán. */
export default async function PaymentTypesSettingsPage() {
  const user = await getCurrentUser();
  const canEdit = user?.role === 'SUPER_ADMIN';

  let paymentTypes: SettingsItem[] = [];
  try {
    paymentTypes = await serverFetch<{ data: SettingsItem[] }>('/payment-types').then(r => r.data);
  } catch { /* empty ok */ }

  return <PaymentTypeSettings data={paymentTypes} canEdit={canEdit} />;
}
