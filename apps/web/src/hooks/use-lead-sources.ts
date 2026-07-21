'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { readSourceCache, writeSourceCache, type LeadSourceCached } from '@/lib/source-cache';
import { getReferenceVersion } from '@/lib/api/reference-versions';

interface UseLeadSourcesResult {
  sources: LeadSourceCached[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Fetch lead sources với cache localStorage, đồng bộ bằng tem phiên bản (reference-data/versions) từ BE.
 * - Mỗi lần mount (mở form): so tem; KHỚP cache -> dùng luôn, KHÁC -> tải lại danh sách.
 *   => ngay khi 1 người CRUD nguồn, mọi người mở form kế tiếp tự thấy data mới (không chờ TTL 24h).
 * - TTL 24h chỉ còn là lưới an toàn cuối.
 * - `refetch()` để force fetch ghi đè cache (refresh button).
 * - `enabled`: chỉ chạy khi true (vd: combobox đang mở) để tránh gọi sớm khi popup chưa cần.
 */
export function useLeadSources(enabled = true): UseLeadSourcesResult {
  const [sources, setSources] = useState<LeadSourceCached[]>([]);
  const [loading, setLoading] = useState(false);
  // Ref tránh re-validate nhiều lần khi `enabled` toggle hoặc parent re-render trong cùng 1 mount
  const loadedRef = useRef(false);

  const refetch = useCallback(async (knownVersion?: string) => {
    setLoading(true);
    try {
      const version = knownVersion ?? (await getReferenceVersion('leadSources'));
      const res = await api.get<{ data: Array<{ id: string | number; name: string }> }>('/lead-sources');
      const list: LeadSourceCached[] = (res.data || []).map((s) => ({
        id: String(s.id),
        name: s.name,
      }));
      setSources(list);
      // Chỉ ghi cache khi có version hợp lệ - tránh lưu cache "mồ côi" không so sánh được sau này.
      if (version) writeSourceCache(list, version);
      loadedRef.current = true;
    } catch (err) {
      // Giữ state cũ; signal cho dev khi API down (user thấy list rỗng nếu chưa cache)
      console.error('Failed to fetch lead-sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (loadedRef.current) return;
    let cancelled = false;
    void (async () => {
      const cached = readSourceCache();
      const version = await getReferenceVersion('leadSources');
      if (cancelled) return;
      // Tem khớp -> cache còn tươi, dùng luôn không tải lại.
      if (cached && version && cached.serverVersion === version) {
        setSources(cached.data);
        loadedRef.current = true;
        return;
      }
      // BE không trả version (mạng lỗi) nhưng có cache cũ -> tạm dùng, không chặn user.
      if (!version && cached) {
        setSources(cached.data);
        loadedRef.current = true;
        return;
      }
      // Tem đổi (có người CRUD) HOẶC chưa có cache -> tải lại full danh sách.
      await refetch(version ?? undefined);
    })();
    return () => { cancelled = true; };
  }, [enabled, refetch]);

  return { sources, loading, refetch };
}
