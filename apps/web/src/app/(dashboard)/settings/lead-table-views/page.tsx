import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { DepartmentLeadTableViewSettings } from '@/components/settings/department-lead-table-view-settings';
import type { NamedEntity } from '@/types/entities';

interface DeptViewConfigItem {
  departmentId: string;
  config: { visible: Record<string, boolean>; order: string[] };
}

/** Settings - Bố cục bảng leads theo phòng ban. SUPER_ADMIN only. */
export default async function LeadTableViewsSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let departments: NamedEntity[] = [];
  let configs: DeptViewConfigItem[] = [];
  let customFieldDefs: { key: string; label: string }[] = [];
  try {
    [departments, configs, customFieldDefs] = await Promise.all([
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data),
      serverFetch<{ data: DeptViewConfigItem[] }>('/department-view-configs').then(r => r.data),
      serverFetch<{ data: { key: string; label: string }[] }>('/lead-field-definitions').then(r => r.data),
    ]);
  } catch { /* empty ok - component hien thi trang thai rong */ }

  return (
    <DepartmentLeadTableViewSettings
      departments={departments}
      initialConfigs={configs}
      customFieldDefs={customFieldDefs}
    />
  );
}
