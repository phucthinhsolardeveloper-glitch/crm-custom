import { serverFetch, getCurrentUser } from '@/lib/auth';
import { ProductGroupSettings } from '@/components/settings/product-group-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Nhóm sản phẩm. */
export default async function ProductGroupsSettingsPage() {
  const user = await getCurrentUser();
  const canEdit = user?.role === 'SUPER_ADMIN';

  let productGroups: SettingsItem[] = [];
  try {
    productGroups = await serverFetch<{ data: SettingsItem[] }>('/product-groups').then(r => r.data).catch(() => []);
  } catch { /* empty ok */ }

  return <ProductGroupSettings data={productGroups} canEdit={canEdit} />;
}
