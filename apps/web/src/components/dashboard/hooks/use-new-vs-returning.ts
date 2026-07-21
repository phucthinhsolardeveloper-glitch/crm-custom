'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import {
  type DashboardRange, type NewVsReturningData,
  rangeToApiQuery,
} from '../constants';

interface NewVsReturningResult {
  data: NewVsReturningData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch breakdown lead KH cũ vs KH mới + convert breakdown theo range.
 * AbortController cancel pending request khi range đổi.
 */
export function useNewVsReturning(range: DashboardRange): NewVsReturningResult {
  const [data, setData] = useState<NewVsReturningData | null>(null);
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

      try {
        const res = await api.get<{ data: NewVsReturningData }>(
          `/dashboard/new-vs-returning?from=${from}&to=${to}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setData(res.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải New vs Returning');
      }
      setLoading(false);
    };

    fetchData();
    return () => controller.abort();
  }, [range.from, range.to, range.preset]);

  return { data, loading, error };
}
