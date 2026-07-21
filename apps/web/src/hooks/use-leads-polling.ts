'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useKhoBaseParams } from '@/components/leads/kho-base-params-context';
import { mergeKhoParams } from '@/components/leads/kho-config';
import type { LeadRecord, ApiListResponse } from '@/types/entities';

/**
 * Polling client-only cho list `/leads`.
 *
 * Mục đích: thay `setInterval(router.refresh)` (re-fetch toàn RSC -> 7+ endpoint mỗi 30s)
 * bằng fetch DUY NHẤT endpoint `/leads`. Reference data (sources, products, users,
 * departments, teams, labels) chỉ fetch lần đầu khi RSC render hoặc khi user đổi
 * URL filter (Next.js navigation tự re-render RSC).
 *
 * Hành vi:
 * - Poll mỗi 30s khi `document.visibilityState === 'visible'`.
 * - Dừng poll khi tab background. Resume + fire NGAY khi tab quay lại visible.
 * - AbortController hủy fetch cũ khi fetch mới khởi động (chống race condition).
 * - Re-sync state khi parent re-render với `initialLeads`/`initialMeta` mới
 *   (vd: navigation đổi filter URL -> RSC fetch lại, prop mới xuống).
 *
 */

const POLL_INTERVAL_MS = 30_000;

export function useLeadsPolling(
  initialLeads: LeadRecord[],
  initialMeta: ApiListResponse<LeadRecord>['meta'],
) {
  const searchParams = useSearchParams();
  // Trang kho: điều kiện scope fix cứng trong code (không trên URL) - merge vào query.
  const khoBaseParams = useKhoBaseParams();
  const [leads, setLeads] = useState<LeadRecord[]>(initialLeads);
  const [meta, setMeta] = useState<ApiListResponse<LeadRecord>['meta']>(initialMeta);
  const abortRef = useRef<AbortController | null>(null);

  // Query string: copy nguyên từ URL nhưng bỏ `cursor` (giống logic RSC ở page.tsx).
  const query = useMemo(() => {
    const qp = mergeKhoParams(new URLSearchParams(searchParams.toString()), khoBaseParams);
    qp.delete('cursor');
    return qp.toString();
  }, [searchParams, khoBaseParams]);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await api.get<ApiListResponse<LeadRecord>>(
        `/leads${query ? `?${query}` : ''}`,
        { signal: ctrl.signal },
      );
      // Chỉ commit nếu fetch này chưa bị abort (controller hiện tại vẫn là ctrl).
      if (abortRef.current === ctrl) {
        setLeads(res.data);
        setMeta(res.meta);
      }
    } catch {
      // Silent: AbortError (do user đổi filter / unmount) hoặc network glitch.
      // Tick tiếp theo sau 30s sẽ tự retry. Notification bell cũng pattern này.
    }
  }, [query]);

  // Re-sync state khi parent đẩy prop mới (navigation đổi filter -> RSC re-render).
  useEffect(() => { setLeads(initialLeads); }, [initialLeads]);
  useEffect(() => { setMeta(initialMeta); }, [initialMeta]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    // Khi user quay lại tab -> fire ngay (không đợi 30s).
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      abortRef.current?.abort();
    };
  }, [refresh]);

  return { leads, meta, refresh };
}
