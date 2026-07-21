import { CustomerActivityByDepartment } from '@/components/customers/customer-activity-by-department';

export function TabActivity({ customerId }: { customerId: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <CustomerActivityByDepartment entityType="CUSTOMER" entityId={customerId} />
    </div>
  );
}
