'use client';

import { useState, useEffect, useRef } from 'react';
import type { TopNResponse } from '@crm/types';
import { api } from '@/lib/api-client';
import {
  type DashboardRange, type ProductSlice, type ReceivablesData,
  rangeToApiQuery,
} from '../constants';

/** Data cho Block 2 (Sản phẩm) + Block 3 (Thanh toán) - admin only. */
export interface ProductPaymentBlocksData {
  byProduct: ProductSlice[];
  byProductGroup: TopNResponse | null;
  byOrderFormat: TopNResponse | null;
  byPaymentType: TopNResponse | null;
  byBankAccount: TopNResponse | null;
  receivables: ReceivablesData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch 6 endpoint cho 2 block Sản phẩm + Thanh toán.
 * Promise.allSettled để 1 endpoint fail không kill cả section (server cache 30s).
 */
export function useProductPaymentBlocks(range: DashboardRange, enabled: boolean): ProductPaymentBlocksData {
  const [data, setData] = useState<Omit<ProductPaymentBlocksData, 'loading' | 'error'>>({
    byProduct: [],
    byProductGroup: null,
    byOrderFormat: null,
    byPaymentType: null,
    byBankAccount: null,
    receivables: null,
  });
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
        const settled = await Promise.allSettled([
          api.get<{ data: ProductSlice[] }>(`/dashboard/revenue/by-product?from=${from}&to=${to}`, opts),
          api.get<{ data: TopNResponse }>(`/dashboard/revenue/by-product-group?from=${from}&to=${to}`, opts),
          api.get<{ data: TopNResponse }>(`/dashboard/revenue/by-order-format?from=${from}&to=${to}`, opts),
          api.get<{ data: TopNResponse }>(`/dashboard/revenue/by-payment-type?from=${from}&to=${to}`, opts),
          api.get<{ data: TopNResponse }>(`/dashboard/revenue/by-bank-account?from=${from}&to=${to}`, opts),
          api.get<{ data: ReceivablesData }>(`/dashboard/receivables?from=${from}&to=${to}`, opts),
        ]);
        if (controller.signal.aborted) return;

        const pick = <T,>(idx: number, fallback: T): T => {
          const r = settled[idx];
          if (r?.status === 'fulfilled') return (r.value as { data: T }).data ?? fallback;
          return fallback;
        };

        setData({
          byProduct: pick<ProductSlice[]>(0, []),
          byProductGroup: pick<TopNResponse | null>(1, null),
          byOrderFormat: pick<TopNResponse | null>(2, null),
          byPaymentType: pick<TopNResponse | null>(3, null),
          byBankAccount: pick<TopNResponse | null>(4, null),
          receivables: pick<ReceivablesData | null>(5, null),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải block sản phẩm / thanh toán');
      }
      setLoading(false);
    };

    fetchData();
    return () => controller.abort();
  }, [range.from, range.to, range.preset, enabled]);

  return { ...data, loading, error };
}
