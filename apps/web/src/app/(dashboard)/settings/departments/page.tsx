import { Users } from 'lucide-react';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { DepartmentSettings } from '@/components/settings/department-settings';
import { TeamManagementWithLeaderSelect } from '@/components/settings/team-management-with-leader-select';
import type { SettingsItem, UserRecord } from '@/types/entities';

/** Settings - Phòng ban & Team. */
export default async function DepartmentsSettingsPage() {
  const user = await getCurrentUser();
  const canEdit = user?.role === 'SUPER_ADMIN';

  let departments: SettingsItem[] = [];
  let users: UserRecord[] = [];
  try {
    [departments, users] = await Promise.all([
      serverFetch<{ data: SettingsItem[] }>('/departments').then(r => r.data),
      serverFetch<{ data: UserRecord[] }>('/users').then(r => r.data || []).catch(() => []),
    ]);
  } catch { /* partial data ok */ }

  return (
    <div className="space-y-6">
      <DepartmentSettings data={departments} canEdit={canEdit} />
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-sky-500" />
          <h3 className="font-semibold text-slate-900">Teams theo phòng ban</h3>
        </div>
        <TeamManagementWithLeaderSelect
          departments={departments}
          users={users as { id: string; name: string; departmentId?: string }[]}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
