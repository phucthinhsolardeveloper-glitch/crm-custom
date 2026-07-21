'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LeadFontWeight } from '@/hooks/use-typography-prefs';

/**
 * Per-column style overrides (font size, weight, background color, text color).
 * Tách hoàn toàn khỏi `useTypographyPrefs` (global) - global vẫn là default,
 * hook này cho phép override theo từng cột cụ thể.
 *
 * Storage key: `crm_lead_column_styles_v1`.
 * Schema: { [columnKey]: { fontSize?, fontWeight?, bgColor?, textColor? } }
 *
 * Tất cả field optional - chỉ apply field nào user set, còn lại fallback global.
 * Khi user reset cột → xóa entry cho cột đó (về full fallback global).
 */

export interface ColumnStyle {
  /** 10-32px. Undefined = dùng global typography.fontSize. */
  fontSize?: number;
  /** 400/500/600/700. Undefined = global. */
  fontWeight?: LeadFontWeight;
  /** HEX #RRGGBB. Undefined = transparent (inherit rowBg). */
  bgColor?: string;
  /** HEX #RRGGBB. Undefined = inherit global typography.color. */
  textColor?: string;
}

export type ColumnStylesMap = Record<string, ColumnStyle>;

const DEFAULT_STORAGE_KEY = 'crm_lead_column_styles_v1';

/** Validate HEX #RRGGBB (6 hex chars). Reject anything else để chặn CSS injection. */
function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Sanitize 1 ColumnStyle entry - drop field invalid, giữ field valid. */
function sanitize(raw: unknown): ColumnStyle {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Partial<ColumnStyle>;
  const out: ColumnStyle = {};
  if (typeof r.fontSize === 'number' && r.fontSize >= 10 && r.fontSize <= 32) out.fontSize = r.fontSize;
  if (([400, 500, 600, 700] as LeadFontWeight[]).includes(r.fontWeight as LeadFontWeight)) out.fontWeight = r.fontWeight as LeadFontWeight;
  if (isValidHex(r.bgColor)) out.bgColor = r.bgColor;
  if (isValidHex(r.textColor)) out.textColor = r.textColor;
  return out;
}

export function useColumnStyles(storageKey = DEFAULT_STORAGE_KEY) {
  const [styles, setStyles] = useState<ColumnStylesMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          const clean: ColumnStylesMap = {};
          for (const [key, val] of Object.entries(parsed)) {
            const sanitized = sanitize(val);
            if (Object.keys(sanitized).length > 0) clean[key] = sanitized;
          }
          setStyles(clean);
        }
      }
    } catch { /* parse fail -> empty */ }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(styles));
    } catch { /* quota -> silent */ }
  }, [styles, hydrated, storageKey]);

  /** Merge partial vào style hiện tại của cột. Set value=undefined để xóa field. */
  const setColumnStyle = useCallback((columnKey: string, partial: Partial<ColumnStyle>) => {
    setStyles((prev) => {
      const current = prev[columnKey] ?? {};
      const next: ColumnStyle = { ...current };
      for (const [k, v] of Object.entries(partial)) {
        if (v === undefined) delete (next as Record<string, unknown>)[k];
        else (next as Record<string, unknown>)[k] = v;
      }
      // Nếu sau khi merge cột không còn field nào → xóa key luôn để map sạch
      if (Object.keys(next).length === 0) {
        const copy = { ...prev };
        delete copy[columnKey];
        return copy;
      }
      return { ...prev, [columnKey]: next };
    });
  }, []);

  const resetColumn = useCallback((columnKey: string) => {
    setStyles((prev) => {
      if (!(columnKey in prev)) return prev;
      const copy = { ...prev };
      delete copy[columnKey];
      return copy;
    });
  }, []);

  const resetAllColumns = useCallback(() => {
    setStyles({});
    try { localStorage.removeItem(storageKey); } catch { /* silent */ }
  }, [storageKey]);

  const getColumnStyle = useCallback((columnKey: string): ColumnStyle => styles[columnKey] ?? {}, [styles]);

  /** True nếu cột có ít nhất 1 override. */
  const hasOverride = useCallback((columnKey: string): boolean => {
    const s = styles[columnKey];
    return !!s && Object.keys(s).length > 0;
  }, [styles]);

  return {
    columnStyles: styles,
    hydratedColumnStyles: hydrated,
    setColumnStyle,
    resetColumn,
    resetAllColumns,
    getColumnStyle,
    hasOverride,
  };
}
