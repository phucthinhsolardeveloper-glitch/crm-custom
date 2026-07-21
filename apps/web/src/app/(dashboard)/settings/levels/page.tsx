import { serverFetch, getCurrentUser } from '@/lib/auth';
import { EmployeeLevelSettings } from '@/components/settings/employee-level-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Cấp bậc nhân viên. */
export default async function LevelsSettingsPage() {
  const user = await getCurrentUser();
  const canEdit = user?.role === 'SUPER_ADMIN';

  let levels: SettingsItem[] = [];
  try {
    levels = await serverFetch<{ data: SettingsItem[] }>('/employee-levels').then(r => r.data);
  } catch { /* empty ok */ }

  return <EmployeeLevelSettings data={levels} canEdit={canEdit} />;
}
