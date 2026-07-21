'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import {
  type DashboardRange, type DashboardStatsData, type FunnelItem, type RevenueDayItem,
  rangeToApiQuery, getPreviousPeriodRange, fmtDay,
} from '../constants';

interface MainSectionData {
  stats: DashboardStatsData | null;
  /** null khi preset không có baseline kỳ trước (vd '7d', '30d', 'custom') -> KPI cards ẩn delta. */
  prevStats: DashboardStatsData | null;
  funnel: FunnelItem[];
  revenue: RevenueDayItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches main dashboard section data: KPI stats (current + optional previous), funnel, revenue.
 * Uses AbortController to cancel in-flight requests on range change (prevents race conditions).
 * prevStats chỉ fetch khi preset có kỳ trước (today -> yesterday, thisMonth -> lastMonth).
 */
export function useDashboardStats(range: DashboardRange): MainSectionData {
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [prevStats, setPrevStats] = useState<DashboardStatsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [revenue, setRevenue] = useState<RevenueDayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const { from, to } = rangeToApiQuery(range);
      const prev = getPreviousPeriodRange(range);
      const prevQuery = prev ? rangeToApiQuery(prev) : null;
      const opts = { signal: controller.signal };

      try {
        const prevPromise = prevQuery
          ? api.get<{ data: DashboardStatsData }>(`/dashboard/stats?from=${prevQuery.from}&to=${prevQuery.to}`, opts)
          : Promise.resolve(null);

        const [statsRes, prevStatsRes, funnelRes, revenueRes] = await Promise.all([
          api.get<{ data: DashboardStatsData }>(`/dashboard/stats?from=${from}&to=${to}`, opts),
          prevPromise,
          api.get<{ data: FunnelItem[] }>(`/dashboard/lead-funnel?from=${from}&to=${to}`, opts),
          api.get<{ data: (RevenueDayItem & { day: string })[] }>(`/dashboard/revenue-trend?from=${from}&to=${to}`, opts),
        ]);

        if (controller.signal.aborted) return;

        setStats(statsRes.data);
        setPrevStats(prevStatsRes ? prevStatsRes.data : null);
        setFunnel(funnelRes.data);
        setRevenue(revenueRes.data.map((r) => ({ ...r, day: fmtDay(r.day) })));
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu dashboard');
      }
      setLoading(false);
    };

    fetchData();
    return () => controller.abort();
    // range là object - dùng primitive fields tránh re-run mỗi render khi parent tạo object mới.
  }, [range.from, range.to, range.preset]);

  return { stats, prevStats, funnel, revenue, loading, error };
}
