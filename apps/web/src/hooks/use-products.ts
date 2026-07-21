'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { readProductCache, writeProductCache, type ProductCached } from '@/lib/product-cache';

interface UseProductsResult {
  products: ProductCached[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/** Lấy tem phiên bản catalog từ BE (request siêu nhẹ). Trả null nếu lỗi mạng -> caller fallback cache cũ. */
async function fetchProductVersion(): Promise<string | null> {
  try {
    const res = await api.get<{ data: { version: string } }>('/products/cache-version');
    return res.data?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch products với cache trong localStorage, đồng bộ bằng tem phiên bản (cache-version) từ BE.
 * - Mỗi lần mount (mở form): gọi tem phiên bản; KHỚP cache -> dùng luôn, KHÁC -> tải lại danh sách.
 *   => ngay khi 1 người CRUD sản phẩm, mọi người mở form kế tiếp tự thấy data mới (không chờ TTL 24h).
 * - TTL 24h chỉ còn là lưới an toàn cuối; tem phiên bản mới là cơ chế làm mới chính.
 * - `refetch()` để force fetch ghi đè cache (refresh button).
 * - `enabled`: chỉ chạy khi true (vd: combobox đang mở) để tránh gọi sớm khi popup chưa cần.
 */
export function useProducts(enabled = true): UseProductsResult {
  const [products, setProducts] = useState<ProductCached[]>([]);
  const [loading, setLoading] = useState(false);
  // Ref tránh re-validate nhiều lần khi `enabled` toggle hoặc parent re-render trong cùng 1 mount
  const loadedRef = useRef(false);

  // Tải full danh sách + ghi cache kèm tem phiên bản. Nhận sẵn version nếu caller đã fetch (tránh gọi 2 lần).
  const refetch = useCallback(async (knownVersion?: string) => {
    setLoading(true);
    try {
      const version = knownVersion ?? (await fetchProductVersion());
      // limit=500 vượt qua BE default 20 - đủ cho catalog nội bộ vài chục đến vài trăm SKU.
      // Khi catalog vượt 500 thì migrate sang cursor pagination.
      const res = await api.get<{ data: Array<{ id: string | number; name: string; price: number | string; vatRate?: number | string; isCombo?: boolean; comboItems?: { child: { id: string | number; name: string; price: number | string } }[] }> }>('/products?limit=500');
      const list: ProductCached[] = (res.data || []).map((p) => ({
        id: String(p.id),
        name: p.name,
        price: Number(p.price) || 0,
        vatRate: Number(p.vatRate) || 0,
        isCombo: !!p.isCombo,
        // Phẳng hoá comboItems.child -> {id,name,price} cho checklist khi tạo đơn.
        comboItems: (p.comboItems || []).map((ci) => ({
          id: String(ci.child.id),
          name: ci.child.name,
          price: Number(ci.child.price) || 0,
        })),
      }));
      setProducts(list);
      // Chỉ ghi cache khi có version hợp lệ - tránh lưu cache "mồ côi" không so sánh được sau này.
      if (version) writeProductCache(list, version);
      loadedRef.current = true;
    } catch (err) {
      // Giữ state cũ; signal cho dev khi API down (user thấy list rỗng nếu chưa cache)
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (loadedRef.current) return;
    let cancelled = false;
    void (async () => {
      const cached = readProductCache();
      const version = await fetchProductVersion();
      if (cancelled) return;
      // Tem khớp -> cache còn tươi, dùng luôn không tải lại.
      if (cached && version && cached.serverVersion === version) {
        setProducts(cached.data);
        loadedRef.current = true;
        return;
      }
      // BE không trả version (mạng lỗi) nhưng có cache cũ -> tạm dùng, không chặn user.
      if (!version && cached) {
        setProducts(cached.data);
        loadedRef.current = true;
        return;
      }
      // Tem đổi (có người CRUD) HOẶC chưa có cache -> tải lại full danh sách.
      await refetch(version ?? undefined);
    })();
    return () => { cancelled = true; };
  }, [enabled, refetch]);

  return { products, loading, refetch };
}
