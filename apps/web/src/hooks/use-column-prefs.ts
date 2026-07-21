'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Persist column width + visibility + order preferences vào localStorage.
 * Dùng chung cho Excel-style tables (LeadTableExcel hiện tại; mở rộng cho customer/order sau này).
 *
 * Key naming convention: `crm_<scope>_columns_<version>` (xem CLAUDE.md + lead-list-advanced-filter-bar).
 * Version bump khi đổi shape lưu trữ - v3 thêm field `order` cho drag-reorder feature.
 *
 * Migration: hydrate đọc cả v3 và (nếu thiếu) v2 cũ - merge width+visible từ v2 vào, bỏ qua order
 * (sẽ dùng default order). Sau khi save state mới → v3 ghi đè, v2 không xóa (giữ để rollback an toàn).
 *
 * Sort state KHÔNG persist ở đây - sort sync qua URL params (?sortBy=&sortDir=).
 */
export interface ColumnPref {
  /** width tính bằng px. undefined = dùng defaultWidth của column. */
  width?: number;
  /** visible=false sẽ ẩn cột khỏi render. Default true. */
  visible?: boolean;
}

export type ColumnPrefs = Record<string, ColumnPref>;

/** Shape lưu trữ v3 = { columns: ColumnPrefs, order: string[] }. */
interface StoredPrefsV3 {
  columns: ColumnPrefs;
  order: string[];
}

interface UseColumnPrefsOptions {
  storageKey: string;
  /** Default state hợp nhất với saved state khi load. */
  defaults?: ColumnPrefs;
}

/** Auto-derive legacy v2 key từ v3 key: ...columns_v3 → ...columns_v2 cho migration. */
function deriveLegacyKey(key: string): string | null {
  if (key.endsWith('_v3')) return key.slice(0, -3) + '_v2';
  return null;
}

export function useColumnPrefs({ storageKey, defaults = {} }: UseColumnPrefsOptions) {
  const [prefs, setPrefs] = useState<ColumnPrefs>(defaults);
  const [order, setOrderState] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate từ localStorage (chỉ chạy 1 lần client-side để tránh SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Distinguish v3 (có shape { columns, order }) vs raw ColumnPrefs cũ.
          const maybeV3 = parsed as Partial<StoredPrefsV3>;
          if (maybeV3.columns && typeof maybeV3.columns === 'object') {
            setPrefs((d) => ({ ...d, ...maybeV3.columns }));
            if (Array.isArray(maybeV3.order)) setOrderState(maybeV3.order);
          } else {
            // Shape không khớp v3 → coi như raw ColumnPrefs cũ.
            setPrefs((d) => ({ ...d, ...(parsed as ColumnPrefs) }));
          }
        }
      } else {
        // Không có v3 → thử migrate từ v2 (chỉ width + visible, không có order).
        const legacyKey = deriveLegacyKey(storageKey);
        if (legacyKey) {
          const legacyRaw = localStorage.getItem(legacyKey);
          if (legacyRaw) {
            try {
              const legacy = JSON.parse(legacyRaw) as ColumnPrefs;
              setPrefs((d) => ({ ...d, ...legacy }));
            } catch { /* ignore legacy parse error */ }
          }
        }
      }
    } catch { /* localStorage disabled / parse error - giữ defaults */ }
    setHydrated(true);
  }, [storageKey]);

  // Persist mọi thay đổi sau khi hydrate (tránh ghi đè saved bằng defaults lúc mount).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const stored: StoredPrefsV3 = { columns: prefs, order };
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch { /* quota / disabled - silent */ }
  }, [prefs, order, storageKey, hydrated]);

  const setWidth = useCallback((columnKey: string, width: number) => {
    setPrefs((p) => ({ ...p, [columnKey]: { ...p[columnKey], width: Math.max(60, Math.round(width)) } }));
  }, []);

  const toggleVisible = useCallback((columnKey: string) => {
    setPrefs((p) => ({ ...p, [columnKey]: { ...p[columnKey], visible: !(p[columnKey]?.visible ?? true) } }));
  }, []);

  const setVisible = useCallback((columnKey: string, visible: boolean) => {
    setPrefs((p) => ({ ...p, [columnKey]: { ...p[columnKey], visible } }));
  }, []);

  /** Replace toàn bộ order (callers truyền full mảng new order). */
  const setOrder = useCallback((next: string[]) => {
    setOrderState(next);
  }, []);

  const resetAll = useCallback(() => {
    setPrefs(defaults);
    setOrderState([]);
    try { localStorage.removeItem(storageKey); } catch { /* silent */ }
  }, [defaults, storageKey]);

  const isVisible = useCallback((columnKey: string) => prefs[columnKey]?.visible ?? true, [prefs]);
  const getWidth = useCallback((columnKey: string, fallback: number) => prefs[columnKey]?.width ?? fallback, [prefs]);

  return { prefs, order, hydrated, setWidth, toggleVisible, setVisible, setOrder, resetAll, isVisible, getWidth };
}
