import { serverFetch } from '@/lib/auth';
import { CustomerForm } from '@/components/customers/customer-form';
import { BackButton } from '@/components/shared/back-button';
import type { NamedEntity } from '@/types/entities';

/** Create new customer page. */
export default async function CreateCustomerPage() {
  let departments: NamedEntity[] = [];
  let users: NamedEntity[] = [];

  try {
    [departments, users] = await Promise.all([
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/users').then(r => r.data),
    ]);
  } catch { /* empty */ }

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-slate-900 mb-6 mt-2">Tạo khách hàng mới</h1>
      <CustomerForm departments={departments} users={users} />
    </div>
  );
}
