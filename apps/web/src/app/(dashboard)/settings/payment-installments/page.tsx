import { serverFetch, getCurrentUser } from '@/lib/auth';
import { PaymentInstallmentSettings } from '@/components/settings/payment-installment-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Lần chuyển khoản (installments). */
export default async function PaymentInstallmentsSettingsPage() {
  const user = await getCurrentUser();
  const canEdit = user?.role === 'SUPER_ADMIN';

  let paymentInstallments: SettingsItem[] = [];
  try {
    paymentInstallments = await serverFetch<{ data: SettingsItem[] }>('/payment-installments').then(r => r.data).catch(() => []);
  } catch { /* empty ok */ }

  return <PaymentInstallmentSettings data={paymentInstallments} canEdit={canEdit} />;
}
