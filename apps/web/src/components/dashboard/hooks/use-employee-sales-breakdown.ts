'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import { type DashboardRange, rangeToApiQuery } from '../constants';

export interface TopLabel {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

export interface SalesBreakdownRow {
  userId: string;
  name: string;
  deptName: string;
  /** Map labelId → count cho top 7 label */
  labelCounts: Record<string, number>;
  otherCount: number;
  untouchedCount: number;
}

export interface SalesBreakdownData {
  topLabels: TopLabel[];
  rows: SalesBreakdownRow[];
}

export function useEmployeeSalesBreakdown(
  range: DashboardRange,
  deptIds?: string[],
  enabled: boolean = true,
) {
  const [data, setData] = useState<SalesBreakdownData>({ topLabels: [], rows: [] });
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

    api.get<{ data: SalesBreakdownData }>(
      `/dashboard/employee-reports/sales-breakdown?from=${from}&to=${to}${deptParam}`,
      { signal: controller.signal },
    )
      .then(res => {
        if (controller.signal.aborted) return;
        setData(res.data || { topLabels: [], rows: [] });
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải báo cáo bán hàng');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range.from, range.to, range.preset, deptIds?.join(','), enabled]);

  return { data, loading, error };
}
