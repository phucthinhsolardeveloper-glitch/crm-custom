import { serverFetch, getCurrentUser } from '@/lib/auth';
import { OrderFormatSettings } from '@/components/settings/order-format-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Hình thức đơn hàng. */
export default async function OrderFormatsSettingsPage() {
  const user = await getCurrentUser();
  const canEdit = user?.role === 'SUPER_ADMIN';

  let orderFormats: SettingsItem[] = [];
  try {
    orderFormats = await serverFetch<{ data: SettingsItem[] }>('/order-formats').then(r => r.data).catch(() => []);
  } catch { /* empty ok */ }

  return <OrderFormatSettings data={orderFormats} canEdit={canEdit} />;
}
