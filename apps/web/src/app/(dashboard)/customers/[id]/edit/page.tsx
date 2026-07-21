import { serverFetch } from '@/lib/auth';
import { CustomerForm } from '@/components/customers/customer-form';
import { BackButton } from '@/components/shared/back-button';
import { notFound } from 'next/navigation';
import type { CustomerRecord, NamedEntity } from '@/types/entities';

/** Edit customer page. */
export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customerData: CustomerRecord | undefined;
  let departments: NamedEntity[] = [];
  let users: NamedEntity[] = [];

  try {
    [customerData, departments, users] = await Promise.all([
      serverFetch<{ data: CustomerRecord }>(`/customers/${id}`).then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/users').then(r => r.data),
    ]);
  } catch {
    notFound();
  }

  const customer = customerData as CustomerRecord;

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-slate-900 mb-6 mt-2">Sửa khách hàng: {customer.name}</h1>
      <CustomerForm customer={customer} departments={departments} users={users} />
    </div>
  );
}
