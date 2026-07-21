'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import {
  type DashboardRange, type TierDistributionItem, type TierMovementData,
  rangeToApiQuery,
} from '../constants';

interface TierBlockData {
  distribution: TierDistributionItem[];
  movement: TierMovementData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch data block "Hạng khách": tier-distribution (toàn thời gian)
 * + tier-movement (dịch chuyển hạng trong kỳ). Endpoint MANAGER+ - chỉ fetch khi admin.
 */
export function useTierBlock(range: DashboardRange, enabled: boolean): TierBlockData {
  const [distribution, setDistribution] = useState<TierDistributionItem[]>([]);
  const [movement, setMovement] = useState<TierMovementData | null>(null);
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
        const [distRes, moveRes] = await Promise.allSettled([
          // distribution không phụ thuộc range nhưng vẫn refetch cùng nhịp cho đơn giản
          api.get<{ data: TierDistributionItem[] }>('/dashboard/tier-distribution', opts),
          api.get<{ data: TierMovementData }>(`/dashboard/tier-movement?from=${from}&to=${to}`, opts),
        ]);
        if (controller.signal.aborted) return;
        if (distRes.status === 'fulfilled') setDistribution(distRes.value.data ?? []);
        if (moveRes.status === 'fulfilled') setMovement(moveRes.value.data ?? null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải block hạng khách');
      }
      setLoading(false);
    };

    fetchData();
    return () => controller.abort();
  }, [range.from, range.to, range.preset, enabled]);

  return { distribution, movement, loading, error };
}
