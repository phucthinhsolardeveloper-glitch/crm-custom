'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import { type DashboardRange, type SourceQualityItem, rangeToApiQuery } from '../constants';

interface SourceQualityData {
  items: SourceQualityItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch bảng chất lượng nguồn lead (GET /dashboard/source-quality).
 * Endpoint MANAGER+ - chỉ fetch khi `enabled=true` (admin role).
 */
export function useSourceQuality(range: DashboardRange, enabled: boolean): SourceQualityData {
  const [items, setItems] = useState<SourceQualityItem[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const { from, to } = rangeToApiQuery(range);

      try {
        const res = await api.get<{ data: SourceQualityItem[] }>(
          `/dashboard/source-quality?from=${from}&to=${to}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setItems(res.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải bảng nguồn lead');
      }
      setLoading(false);
    };

    fetchData();
    return () => controller.abort();
  }, [range.from, range.to, range.preset, enabled]);

  return { items, loading, error };
}
