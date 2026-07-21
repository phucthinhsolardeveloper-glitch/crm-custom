import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { LabelSettings } from '@/components/settings/label-settings';
import type { LabelEntity, LabelRecallConfigItem } from '@/types/entities';

/** Settings - Nhãn lead/khách hàng. MANAGER+ mới được xem/sửa. */
export default async function LabelsSettingsPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  if (!isAdmin && !isManager) {
    redirect('/settings');
  }

  let labels: LabelEntity[] = [];
  let labelRecallConfigs: LabelRecallConfigItem[] = [];
  try {
    labels = await serverFetch<{ data: LabelEntity[] }>('/labels').then(r => r.data);
  } catch { /* empty ok */ }
  try {
    labelRecallConfigs = await serverFetch<{ data: LabelRecallConfigItem[] }>(
      '/recall-configs/labels',
    ).then(r => r.data);
  } catch { /* SUPER_ADMIN only - bỏ qua cho MANAGER */ }

  return (
    <LabelSettings
      data={labels}
      recallConfigs={labelRecallConfigs}
      canEdit={isAdmin || isManager}
      canEditRecall={isAdmin}
    />
  );
}
