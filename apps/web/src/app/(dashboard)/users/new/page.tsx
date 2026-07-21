import { serverFetch, getCurrentUser } from '@/lib/auth';
import { UserForm } from '@/components/users/user-form';
import { BackButton } from '@/components/shared/back-button';
import type { NamedEntity } from '@/types/entities';

/** Create new user page. */
export default async function CreateUserPage() {
  let departments: NamedEntity[] = [];
  let levels: NamedEntity[] = [];

  try {
    [departments, levels] = await Promise.all([
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/employee-levels').then(r => r.data),
    ]);
  } catch { /* empty */ }

  const me = await getCurrentUser();

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-slate-900 mb-6 mt-2">Tạo nhân viên mới</h1>
      <UserForm
        departments={departments}
        levels={levels}
        currentUserRole={me?.role}
      />
    </div>
  );
}
