'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { type DashboardRange, getDefaultRange } from '@/components/dashboard/constants';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { useEmployeeScores } from '@/components/dashboard/hooks/use-employee-scores';
import { useEmployeeCallReport } from '@/components/dashboard/hooks/use-employee-call-report';
import { useEmployeeSalesBreakdown } from '@/components/dashboard/hooks/use-employee-sales-breakdown';
import type { DrillDownMode } from '@/components/dashboard/hooks/use-customer-drill-down';
import { EmployeeSummaryTable } from '@/components/dashboard/widgets/employee-summary-table';
import { EmployeeCallTable } from '@/components/dashboard/widgets/employee-call-table';
import { EmployeeSalesTable } from '@/components/dashboard/widgets/employee-sales-table';
import { CustomerDrillDownPanel } from '@/components/dashboard/widgets/customer-drill-down-panel';
import { FilterSearchableSelect } from '@/components/leads/filter-searchable-select';

type TabKey = 'summary' | 'calls' | 'sales';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: 'Báo cáo tổng' },
  { key: 'calls', label: 'Báo cáo cuộc gọi' },
  { key: 'sales', label: 'Bán hàng' },
];

interface Department { id: string; name: string }

interface DrillDownState {
  open: boolean;
  userId: string | null;
  userName?: string;
  mode: DrillDownMode | null;
  modeLabel?: string;
}

function EmployeesPageInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state synced với URL ?tab=
  const tabFromUrl = (searchParams.get('tab') as TabKey) || 'summary';
  const tab: TabKey = TABS.some(t => t.key === tabFromUrl) ? tabFromUrl : 'summary';

  const [range, setRange] = useState<DashboardRange>(getDefaultRange);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    open: false, userId: null, mode: null,
  });

  // Lazy fetch per tab
  const { employees, loading: scoresLoading, error: scoresError } = useEmployeeScores(
    range, deptIds, tab === 'summary',
  );
  // Calls cần luôn fetch (Báo cáo tổng cần merge số cuộc gọi)
  const callsNeeded = tab === 'summary' || tab === 'calls';
  const { rows: callRows, loading: callsLoading, error: callsError } = useEmployeeCallReport(
    range, deptIds, callsNeeded,
  );
  const { data: salesData, loading: salesLoading, error: salesError } = useEmployeeSalesBreakdown(
    range, deptIds, tab === 'sales',
  );

  // Fetch departments once
  useEffect(() => {
    api.get<{ data: Department[] }>('/departments')
      .then(res => setDepartments(res.data || []))
      .catch(() => {});
  }, []);

  // Setter for tab → URL replace (không spam history)
  const setTab = useCallback((next: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`?${params.toString()}`, { scroll: false });
    // Đóng drill-down khi đổi tab
    setDrillDown({ open: false, userId: null, mode: null });
  }, [router, searchParams]);

  // Click cell trong tab sales → mở drill-down
  const openDrillDown = useCallback((userId: string, mode: DrillDownMode) => {
    const userRow = salesData.rows.find(r => r.userId === userId);
    let modeLabel = 'Danh sách KH';
    if ('labelId' in mode && mode.labelId) {
      const label = salesData.topLabels.find(l => l.id === mode.labelId);
      modeLabel = label ? `Label: ${label.name}` : 'Label';
    } else if ('untouched' in mode && mode.untouched) {
      modeLabel = 'KH chưa tiếp cận';
    } else if ('other' in mode && mode.other) {
      modeLabel = 'KH thuộc label khác';
    }
    setDrillDown({
      open: true,
      userId,
      userName: userRow?.name,
      mode,
      modeLabel,
    });
  }, [salesData.rows, salesData.topLabels]);

  const closeDrillDown = useCallback(() => {
    setDrillDown(s => ({ ...s, open: false }));
  }, []);

  // Đóng panel khi route đổi
  useEffect(() => {
    return () => setDrillDown({ open: false, userId: null, mode: null });
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex h-[400px] items-center justify-center text-slate-400">
        Bạn không có quyền xem trang này
      </div>
    );
  }

  const currentError = tab === 'summary'
    ? scoresError || callsError
    : tab === 'calls' ? callsError : salesError;

  return (
    <div className="space-y-6">
      {/* Header dùng chung DashboardHeader (DateTimeRangePicker) */}
      <DashboardHeader
        isAdmin={isAdmin}
        range={range}
        onRangeChange={setRange}
        title="Hiệu suất nhân viên"
      />

      {/* Department filter - riêng vì DashboardHeader chung không biết dept */}
      <div className="flex justify-end">
        <FilterSearchableSelect
          value={deptIds}
          onChange={setDeptIds}
          options={departments.map(d => ({ value: d.id, label: d.name }))}
          placeholder="Tất cả phòng ban"
          allLabel="Tất cả phòng ban"
          searchPlaceholder="Tìm phòng ban..."
        />
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-sky-500 text-sky-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {currentError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{currentError}</div>
      )}

      {/* Tab content */}
      {tab === 'summary' && (
        <EmployeeSummaryTable
          scores={employees}
          calls={callRows}
          loading={scoresLoading || callsLoading}
        />
      )}
      {tab === 'calls' && (
        <EmployeeCallTable
          rows={callRows}
          loading={callsLoading}
        />
      )}
      {tab === 'sales' && (
        <EmployeeSalesTable
          topLabels={salesData.topLabels}
          rows={salesData.rows}
          loading={salesLoading}
          onCellClick={openDrillDown}
        />
      )}

      {/* Drill-down side panel */}
      <CustomerDrillDownPanel
        open={drillDown.open}
        userId={drillDown.userId}
        userName={drillDown.userName}
        mode={drillDown.mode}
        modeLabel={drillDown.modeLabel}
        range={range}
        onClose={closeDrillDown}
      />
    </div>
  );
}

export default function DashboardEmployeesPage() {
  // Suspense bao quanh do useSearchParams cần boundary trong Next.js 15+
  return (
    <Suspense fallback={<div className="h-[400px] animate-pulse rounded-xl bg-slate-100" />}>
      <EmployeesPageInner />
    </Suspense>
  );
}
