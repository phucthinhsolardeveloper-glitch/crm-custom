import { serverFetch, getCurrentUser } from '@/lib/auth';
import { BackButton } from '@/components/shared/back-button';
import { notFound } from 'next/navigation';
import type { UserRecord, NamedEntity, ApiListResponse } from '@/types/entities';
import { UserEditTabs } from '@/components/users/user-edit-tabs';

/** Edit user page với 2 tab: thông tin chung + SĐT phụ trách (super_admin). */
export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userData: UserRecord | undefined;
  let departments: NamedEntity[] = [];
  let levels: NamedEntity[] = [];

  try {
    [userData, departments, levels] = await Promise.all([
      serverFetch<{ data: UserRecord }>(`/users/${id}`).then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/employee-levels').then(r => r.data),
    ]);
  } catch {
    notFound();
  }

  const user = userData as UserRecord;

  // Super admin được thấy tab "SĐT phụ trách" + danh sách users để transfer
  const me = await getCurrentUser();
  const isSuperAdmin = me?.role === 'SUPER_ADMIN';
  let allUsers: UserRecord[] = [];
  if (isSuperAdmin) {
    try {
      const res = await serverFetch<ApiListResponse<UserRecord>>('/users?limit=500');
      allUsers = res.data;
    } catch { /* empty */ }
  }

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-slate-900 mb-6 mt-2">Sửa nhân viên: {user.name}</h1>
      <UserEditTabs
        user={user}
        departments={departments}
        levels={levels}
        showPhonesTab={isSuperAdmin}
        showKpiTab={isSuperAdmin}
        allUsers={allUsers}
        currentUserRole={me?.role}
      />
    </div>
  );
}
