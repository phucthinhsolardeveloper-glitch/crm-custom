import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { WebhookEndpointSettings } from '@/components/settings/webhook-endpoint-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Webhook endpoints. SUPER_ADMIN only. */
export default async function WebhooksSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let webhookEndpoints: SettingsItem[] = [];
  try {
    webhookEndpoints = await serverFetch<{ data: SettingsItem[] }>('/webhook-endpoints').then(r => r.data).catch(() => []);
  } catch { /* empty ok */ }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return <WebhookEndpointSettings endpoints={webhookEndpoints as any[]} />;
}
