'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { type DashboardRange, getDefaultRange } from '@/components/dashboard/constants';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { useTabData, type CustomersTabData } from '@/components/dashboard/hooks/use-tab-data';
import { TabCustomers } from '@/components/dashboard/tabs/tab-customers';

export default function DashboardCustomersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';
  const [range, setRange] = useState<DashboardRange>(getDefaultRange);

  const { data, loading, error } = useTabData<CustomersTabData>('customers', range, isAdmin, true);

  return (
    <div className="space-y-6">
      <DashboardHeader isAdmin={isAdmin} range={range} onRangeChange={setRange} title="Khách hàng" subtitle="Phân tích leads và khách hàng" />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}
      <TabCustomers data={data} loading={loading} isAdmin={isAdmin} />
    </div>
  );
}
