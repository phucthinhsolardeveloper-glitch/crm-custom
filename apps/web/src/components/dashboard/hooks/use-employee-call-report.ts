'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import { type DashboardRange, rangeToApiQuery } from '../constants';

export interface EmployeeCallReportRow {
  userId: string;
  name: string;
  deptName: string;
  callsAnswered: number;
  callsOutgoing: number;
  outgoingTotalSeconds: number;
  outgoingAvgSeconds: number;
}

export function useEmployeeCallReport(
  range: DashboardRange,
  deptIds?: string[],
  enabled: boolean = true,
) {
  const [rows, setRows] = useState<EmployeeCallReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    const { from, to } = rangeToApiQuery(range);
    const deptParam = deptIds?.length ? `&deptIds=${deptIds.join(',')}` : '';

    api.get<{ data: EmployeeCallReportRow[] }>(
      `/dashboard/employee-reports/calls?from=${from}&to=${to}${deptParam}`,
      { signal: controller.signal },
    )
      .then(res => {
        if (controller.signal.aborted) return;
        setRows(res.data || []);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải báo cáo cuộc gọi');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range.from, range.to, range.preset, deptIds?.join(','), enabled]);

  return { rows, loading, error };
}
