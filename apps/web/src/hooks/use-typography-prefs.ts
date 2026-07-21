'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Persist typography preferences (font size/weight/color/family) cho bảng leads.
 *
 * Tách hook riêng khỏi `useColumnPrefs` để giữ KISS + tránh breaking key v3 cũ.
 * Key riêng: `crm_lead_typography_v1`.
 *
 * Lý do: typography là concern khác (visual rendering) so với columns
 * (visibility/order/width). Tách giúp:
 * - Migration đơn giản (key độc lập, không phải bump version cùng)
 * - Reset typography không động columns và ngược lại
 * - Test/share dễ nếu sau này muốn share giữa các bảng khác
 */

export type LeadFontSize = 12 | 13 | 14 | 15 | 16;
export type LeadFontWeight = 400 | 500 | 600 | 700;
export type LeadFontFamily = 'plus-jakarta-sans' | 'inter' | 'system';

export interface LeadTypographyPrefs {
  fontSize: LeadFontSize;
  fontWeight: LeadFontWeight;
  color: string;       // hex color: '#0f172a' (slate-900) default
  fontFamily: LeadFontFamily;
  /** Áp dụng typography cho `<th>` (default true). Off -> header dùng default đảm bảo nổi bật. */
  applyToHeader: boolean;
  /** Áp dụng typography cho `<td>` data cells (default true). Off -> data dùng default. */
  applyToData: boolean;
}

export const DEFAULT_TYPOGRAPHY: LeadTypographyPrefs = {
  fontSize: 14,
  fontWeight: 500,
  color: '#0f172a',
  fontFamily: 'plus-jakarta-sans',
  applyToHeader: true,
  applyToData: true,
};

const DEFAULT_STORAGE_KEY = 'crm_lead_typography_v1';

/** Hex color validation - chỉ accept #RRGGBB (6 chars). Tránh CSS injection từ raw user input. */
function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Map font family key -> CSS value. Giữ enum-like để có whitelist an toàn. */
export const FONT_FAMILY_CSS: Record<LeadFontFamily, string> = {
  'plus-jakarta-sans': "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  'inter': "'Inter', ui-sans-serif, system-ui, sans-serif",
  'system': 'ui-sans-serif, system-ui, sans-serif',
};

export function useTypographyPrefs(storageKey = DEFAULT_STORAGE_KEY) {
  const [prefs, setPrefs] = useState<LeadTypographyPrefs>(DEFAULT_TYPOGRAPHY);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate từ localStorage (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LeadTypographyPrefs>;
        // Merge defaults + parsed, validate từng field
        setPrefs({
          fontSize: ([12, 13, 14, 15, 16] as LeadFontSize[]).includes(parsed.fontSize as LeadFontSize)
            ? (parsed.fontSize as LeadFontSize) : DEFAULT_TYPOGRAPHY.fontSize,
          fontWeight: ([400, 500, 600, 700] as LeadFontWeight[]).includes(parsed.fontWeight as LeadFontWeight)
            ? (parsed.fontWeight as LeadFontWeight) : DEFAULT_TYPOGRAPHY.fontWeight,
          color: typeof parsed.color === 'string' && isValidHex(parsed.color)
            ? parsed.color : DEFAULT_TYPOGRAPHY.color,
          fontFamily: parsed.fontFamily && parsed.fontFamily in FONT_FAMILY_CSS
            ? (parsed.fontFamily as LeadFontFamily) : DEFAULT_TYPOGRAPHY.fontFamily,
          // Backward compat: old storage không có 2 field này -> default true
          applyToHeader: typeof parsed.applyToHeader === 'boolean'
            ? parsed.applyToHeader : DEFAULT_TYPOGRAPHY.applyToHeader,
          applyToData: typeof parsed.applyToData === 'boolean'
            ? parsed.applyToData : DEFAULT_TYPOGRAPHY.applyToData,
        });
      }
    } catch { /* parse fail -> defaults */ }
    setHydrated(true);
  }, [storageKey]);

  // Persist mỗi lần đổi (after hydrated)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch { /* quota -> silent */ }
  }, [prefs, hydrated, storageKey]);

  const update = useCallback(<K extends keyof LeadTypographyPrefs>(key: K, value: LeadTypographyPrefs[K]) => {
    // Validate color tại update site cho extra safety
    if (key === 'color' && typeof value === 'string' && !isValidHex(value as string)) return;
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setPrefs(DEFAULT_TYPOGRAPHY);
    try { localStorage.removeItem(storageKey); } catch { /* silent */ }
  }, [storageKey]);

  return { typography: prefs, hydrated, updateTypography: update, resetTypography: reset };
}
