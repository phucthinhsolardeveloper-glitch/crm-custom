import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { LeadCustomFieldSettings } from '@/components/settings/lead-custom-field-settings';

interface LeadFieldDefItem {
  id: string;
  key: string;
  label: string;
  type: string;
  isActive: boolean;
  sortOrder: number;
}

/** Settings - Trường tùy chỉnh lead. SUPER_ADMIN only. */
export default async function LeadCustomFieldsSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let fields: LeadFieldDefItem[] = [];
  try {
    fields = await serverFetch<{ data: LeadFieldDefItem[] }>(
      '/lead-field-definitions?includeInactive=true',
    ).then(r => r.data);
  } catch { /* empty ok */ }

  return <LeadCustomFieldSettings initialFields={fields} />;
}
