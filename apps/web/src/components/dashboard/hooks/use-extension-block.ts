'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import {
  type DashboardRange, type ConversionByHourItem, type AgingItem,
  rangeToApiQuery,
} from '../constants';

interface ExtensionBlockData {
  byHour: ConversionByHourItem[];
  aging: AgingItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch data block "lát cắt mở rộng": conversion-by-hour (theo range)
 * + lead-aging (snapshot hiện tại). Bảng Sale dùng useEmployeeScores riêng.
 */
export function useExtensionBlock(range: DashboardRange, enabled: boolean): ExtensionBlockData {
  const [byHour, setByHour] = useState<ConversionByHourItem[]>([]);
  const [aging, setAging] = useState<AgingItem[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const { from, to } = rangeToApiQuery(range);
      const opts = { signal: controller.signal };

      try {
        const [hourRes, agingRes] = await Promise.allSettled([
          api.get<{ data: ConversionByHourItem[] }>(`/dashboard/conversion-by-hour?from=${from}&to=${to}`, opts),
          api.get<{ data: AgingItem[] }>('/dashboard/lead-aging', opts),
        ]);
        if (controller.signal.aborted) return;
        if (hourRes.status === 'fulfilled') setByHour(hourRes.value.data ?? []);
        if (agingRes.status === 'fulfilled') setAging(agingRes.value.data ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải block mở rộng');
      }
      setLoading(false);
    };

    fetchData();
    return () => controller.abort();
  }, [range.from, range.to, range.preset, enabled]);

  return { byHour, aging, loading, error };
}
