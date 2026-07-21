import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { AiPromptSettings } from '@/components/settings/ai-prompt-settings';

/** Settings - AI cấu hình (prompt). SUPER_ADMIN only. */
export default async function AiSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let aiSettings: Record<string, string> = {};
  try {
    aiSettings = await serverFetch<{ data: Record<string, string> }>('/system-settings').then(r => r.data);
  } catch { /* empty ok */ }

  return <AiPromptSettings initialSettings={aiSettings || {}} />;
}
