import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { DepartmentLabelVisibilitySettings } from '@/components/settings/department-label-visibility-settings';
import type { LabelEntity, NamedEntity } from '@/types/entities';

interface DepartmentLabelConfigItem {
  departmentId: string;
  labelIds: string[];
}

/** Settings - Nhãn hiển thị theo phòng ban. SUPER_ADMIN only. */
export default async function LabelVisibilitySettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let departments: NamedEntity[] = [];
  let labels: LabelEntity[] = [];
  let configs: DepartmentLabelConfigItem[] = [];
  try {
    [departments, labels, configs] = await Promise.all([
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data),
      serverFetch<{ data: LabelEntity[] }>('/labels').then(r => r.data),
      serverFetch<{ data: DepartmentLabelConfigItem[] }>('/labels/department-config').then(r => r.data),
    ]);
  } catch { /* empty ok - component hien thi trang thai rong */ }

  return (
    <DepartmentLabelVisibilitySettings
      departments={departments}
      labels={labels}
      initialConfigs={configs}
    />
  );
}
