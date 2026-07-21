'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { type DashboardRange, getDefaultRange } from '@/components/dashboard/constants';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { useTabData, type RevenueTabData } from '@/components/dashboard/hooks/use-tab-data';
import { TabRevenue } from '@/components/dashboard/tabs/tab-revenue';

export default function DashboardRevenuePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';
  const [range, setRange] = useState<DashboardRange>(getDefaultRange);

  const { data, loading, error } = useTabData<RevenueTabData>('revenue', range, isAdmin, true);

  return (
    <div className="space-y-6">
      <DashboardHeader isAdmin={isAdmin} range={range} onRangeChange={setRange} title="Doanh thu" subtitle="Phân tích doanh thu chi tiết" />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}
      <TabRevenue data={data} loading={loading} isAdmin={isAdmin} />
    </div>
  );
}
