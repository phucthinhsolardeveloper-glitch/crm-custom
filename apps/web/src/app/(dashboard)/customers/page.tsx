import { serverFetch, getCurrentUser } from '@/lib/auth';
import type { CustomerRecord, NamedEntity, LabelEntity, ApiListResponse } from '@/types/entities';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { CustomerCardGrid } from '@/components/customers/customer-card-grid';
import { CustomerListAdvancedFilterBar } from '@/components/customers/customer-list-advanced-filter-bar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/shared/csv-export-button';

/** Customer list page - card grid with advanced filters incl. spending range. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  const query = qp.toString();

  const currentUser = await getCurrentUser();
  const isManager = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');

  let data: CustomerRecord[] = [];
  let meta: ApiListResponse<CustomerRecord>['meta'] = {};
  let departments: NamedEntity[] = [];
  let users: NamedEntity[] = [];
  let labels: LabelEntity[] = [];

  try {
    const [result, deptRes, usersRes, labelsRes] = await Promise.all([
      serverFetch<ApiListResponse<CustomerRecord>>(`/customers?${query}`),
      serverFetch<{ data: NamedEntity[] }>('/departments').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/users').catch(() => ({ data: [] })),
      serverFetch<{ data: LabelEntity[] }>('/labels').catch(() => ({ data: [] })),
    ]);
    data = result.data;
    meta = result.meta;
    departments = (deptRes.data || []).map((d: NamedEntity) => ({ id: String(d.id), name: d.name }));
    users = (usersRes.data || []).map((u: NamedEntity) => ({ id: String(u.id), name: u.name }));
    labels = (labelsRes.data || []).map((l: LabelEntity) => ({ id: String(l.id), name: l.name, color: l.color || '#6b7280', textColor: l.textColor || '#ffffff' }));
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khách hàng</h1>
          <p className="text-sm text-slate-500">Quản lý thông tin khách hàng</p>
        </div>
        <div className="flex gap-2">
          <CsvExportButton exportPath="/exports/customers" />
          {isManager && (
            <Link href="/customers/new">
              <Button><Plus className="h-4 w-4 mr-1" />Tạo khách hàng</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4">
        <CustomerListAdvancedFilterBar departments={departments} users={users} labels={labels} />
      </div>

      <div className="mt-4">
        <CustomerCardGrid customers={data} />
      </div>
      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
