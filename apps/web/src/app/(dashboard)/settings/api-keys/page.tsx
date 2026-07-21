import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { ApiKeySettings } from '@/components/settings/api-key-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - API Keys. SUPER_ADMIN only. */
export default async function ApiKeysSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let apiKeys: SettingsItem[] = [];
  try {
    apiKeys = await serverFetch<{ data: SettingsItem[] }>('/api-keys').then(r => r.data).catch(() => []);
  } catch { /* empty ok */ }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return <ApiKeySettings apiKeys={apiKeys as any[]} />;
}
