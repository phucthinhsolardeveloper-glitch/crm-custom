import { serverFetch } from '@/lib/auth';
import type { NamedEntity } from '@/types/entities';
import { DistributionAiWeightConfigClient } from '@/components/settings/distribution-ai-weight-config-client';
import { AssignmentTemplateCrudWithApply } from '@/components/settings/assignment-template-crud-with-apply';

/** Distribution config page - AI weights + manual assignment templates. */
export default async function DistributionSettingsPage() {
  let departments: { id: string; name: string }[] = [];
  let users: { id: string; name: string; departmentId?: string }[] = [];
  try {
    const [deptRes, usersRes] = await Promise.all([
      serverFetch<{ data: NamedEntity[] }>('/departments'),
      serverFetch<{ data: NamedEntity[] }>('/users').catch(() => ({ data: [] })),
    ]);
    departments = deptRes.data;
    users = (usersRes.data || []).map((u: NamedEntity & { departmentId?: string }) => ({ id: String(u.id), name: u.name, departmentId: u.departmentId ? String(u.departmentId) : undefined }));
  } catch { /* empty */ }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Phân phối Leads</h1>
        <p className="text-sm text-slate-500">Cấu hình phân phối tự động (AI) và thủ công (template round-robin)</p>
      </div>

      {/* AI Distribution */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Phân phối AI tự động</h2>
        <DistributionAiWeightConfigClient departments={departments} />
      </div>

      {/* Manual Assignment Templates */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <AssignmentTemplateCrudWithApply users={users} departments={departments} />
      </div>
    </div>
  );
}
