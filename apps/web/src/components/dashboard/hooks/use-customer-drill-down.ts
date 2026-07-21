'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { type DashboardRange, rangeToApiQuery } from '../constants';

export type DrillDownMode =
  | { labelId: string; untouched?: never; other?: never }
  | { untouched: true; labelId?: never; other?: never }
  | { other: true; labelId?: never; untouched?: never };

export interface DrillDownLabel {
  id: string;
  name: string;
  color: string;
}

export interface DrillDownCustomer {
  id: string;
  name: string;
  phone: string;
  labels: DrillDownLabel[];
  lastActivityAt: string | null;
  ordersCount: number;
  totalRevenue: number;
}

export interface DrillDownResponse {
  data: DrillDownCustomer[];
  cursor: string | null;
  total: number;
}

function buildQuery(
  userId: string,
  mode: DrillDownMode,
  range: DashboardRange,
  cursor: string | null,
): string {
  const { from, to } = rangeToApiQuery(range);
  const params = new URLSearchParams({ userId, from, to });
  if ('labelId' in mode && mode.labelId) params.set('labelId', mode.labelId);
  if ('untouched' in mode && mode.untouched) params.set('untouched', 'true');
  if ('other' in mode && mode.other) params.set('other', 'true');
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function useCustomerDrillDown(
  userId: string | null,
  mode: DrillDownMode | null,
  range: DashboardRange,
) {
  const [items, setItems] = useState<DrillDownCustomer[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initial fetch when params change
  useEffect(() => {
    if (!userId || !mode) {
      setItems([]);
      setCursor(null);
      setTotal(0);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setItems([]);
    const qs = buildQuery(userId, mode, range, null);

    api.get<{ data: DrillDownResponse }>(
      `/dashboard/employee-reports/sales-breakdown/customers?${qs}`,
      { signal: controller.signal },
    )
      .then(res => {
        if (controller.signal.aborted) return;
        setItems(res.data.data || []);
        setCursor(res.data.cursor);
        setTotal(res.data.total);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không tải được danh sách');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [userId, mode, range.from, range.to, range.preset]);

  const loadMore = useCallback(async () => {
    if (!userId || !mode || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = buildQuery(userId, mode, range, cursor);
      const res = await api.get<{ data: DrillDownResponse }>(
        `/dashboard/employee-reports/sales-breakdown/customers?${qs}`,
      );
      setItems(prev => [...prev, ...(res.data.data || [])]);
      setCursor(res.data.cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được trang tiếp');
    } finally {
      setLoadingMore(false);
    }
  }, [userId, mode, range.from, range.to, range.preset, cursor, loadingMore]);

  return { items, total, cursor, hasMore: cursor !== null, loading, loadingMore, error, loadMore };
}
