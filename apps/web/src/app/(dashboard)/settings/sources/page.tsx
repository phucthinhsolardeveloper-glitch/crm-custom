import { Megaphone } from 'lucide-react';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { LeadSourceSettings } from '@/components/settings/lead-source-settings';
import { LeadGroupSettings } from '@/components/settings/lead-group-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Nguồn lead (cấp cha) + Nhóm theo nguồn (cấp con). */
export default async function SourcesSettingsPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';

  let sources: SettingsItem[] = [];
  let leadGroups: SettingsItem[] = [];
  try {
    sources = await serverFetch<{ data: SettingsItem[] }>('/lead-sources').then(r => r.data);
  } catch { /* empty ok */ }
  try {
    leadGroups = await serverFetch<{ data: SettingsItem[] }>('/lead-groups').then(r => r.data).catch(() => []);
  } catch { /* may be empty */ }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Nguồn lead</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Quản lý nguồn lead 2 cấp: <span className="font-medium text-slate-700">Nguồn</span> (cấp cha) chứa nhiều{' '}
          <span className="font-medium text-slate-700">Nhóm</span> (cấp con). Chọn 1 Nguồn để xem và sửa các Nhóm bên dưới.
        </p>
      </header>

      {/* Nguồn (cấp cha): chỉ SUPER_ADMIN CRUD. */}
      <LeadSourceSettings data={sources} canEdit={isAdmin} />
      {/* Nhóm (cấp con): MANAGER+ CRUD, gom theo Nguồn cha. */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone size={18} className="text-sky-500" />
          <h3 className="font-semibold text-slate-900">Nhóm theo nguồn</h3>
        </div>
        <LeadGroupSettings groups={leadGroups} sources={sources} canEdit={isAdmin || isManager} />
      </div>
    </div>
  );
}
