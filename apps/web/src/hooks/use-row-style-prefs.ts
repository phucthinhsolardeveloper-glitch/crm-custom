'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Persist row-level color preferences (zebra pair + hover + selected) cho bảng leads.
 * Storage key: `crm_lead_row_styles_v1`.
 *
 * Tách hook riêng khỏi useColumnPrefs/useColumnStyles vì concern khác (row vs column),
 * giúp reset/migrate độc lập.
 */

export interface RowStylePrefs {
  /** Row index lẻ (idx % 2 === 1). Default '#f8fafc' (slate-50). */
  oddRowBg: string;
  /** Row index chẵn. Default '#ffffff'. */
  evenRowBg: string;
  /** Hover row. Default '#f0f9ff' (sky-50). */
  hoverBg: string;
  /** Row được select (checkbox tick). Default '#e0f2fe' (sky-100). */
  selectedBg: string;
  /** Text color cho row lẻ. Default '#0f172a' (slate-900). */
  oddRowText: string;
  /** Text color cho row chẵn. Default '#0f172a' (slate-900). */
  evenRowText: string;
  /** Text color khi hover. Default '#0c4a6e' (sky-900). */
  hoverText: string;
  /** Text color khi row được select. Default '#0c4a6e' (sky-900). */
  selectedText: string;
}

export const DEFAULT_ROW_STYLE: RowStylePrefs = {
  oddRowBg: '#f8fafc',
  evenRowBg: '#ffffff',
  hoverBg: '#f0f9ff',
  selectedBg: '#e0f2fe',
  oddRowText: '#0f172a',
  evenRowText: '#0f172a',
  hoverText: '#0c4a6e',
  selectedText: '#0c4a6e',
};

const DEFAULT_STORAGE_KEY = 'crm_lead_row_styles_v1';

function isValidHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function useRowStylePrefs(storageKey = DEFAULT_STORAGE_KEY) {
  const [prefs, setPrefs] = useState<RowStylePrefs>(DEFAULT_ROW_STYLE);
  const [hydratedRowStyles, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<RowStylePrefs>;
        // Backward-compat: payload cũ chỉ có 4 bg field. Field text mới sẽ fallback default.
        setPrefs({
          oddRowBg: isValidHex(parsed.oddRowBg) ? parsed.oddRowBg : DEFAULT_ROW_STYLE.oddRowBg,
          evenRowBg: isValidHex(parsed.evenRowBg) ? parsed.evenRowBg : DEFAULT_ROW_STYLE.evenRowBg,
          hoverBg: isValidHex(parsed.hoverBg) ? parsed.hoverBg : DEFAULT_ROW_STYLE.hoverBg,
          selectedBg: isValidHex(parsed.selectedBg) ? parsed.selectedBg : DEFAULT_ROW_STYLE.selectedBg,
          oddRowText: isValidHex(parsed.oddRowText) ? parsed.oddRowText : DEFAULT_ROW_STYLE.oddRowText,
          evenRowText: isValidHex(parsed.evenRowText) ? parsed.evenRowText : DEFAULT_ROW_STYLE.evenRowText,
          hoverText: isValidHex(parsed.hoverText) ? parsed.hoverText : DEFAULT_ROW_STYLE.hoverText,
          selectedText: isValidHex(parsed.selectedText) ? parsed.selectedText : DEFAULT_ROW_STYLE.selectedText,
        });
      }
    } catch { /* fall through to defaults */ }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydratedRowStyles) return;
    try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* silent */ }
  }, [prefs, hydratedRowStyles, storageKey]);

  const setRowStyle = useCallback(<K extends keyof RowStylePrefs>(key: K, value: RowStylePrefs[K]) => {
    if (!isValidHex(value)) return;
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const resetRowStyles = useCallback(() => {
    setPrefs(DEFAULT_ROW_STYLE);
    try { localStorage.removeItem(storageKey); } catch { /* silent */ }
  }, [storageKey]);

  return { rowStyles: prefs, hydratedRowStyles, setRowStyle, resetRowStyles };
}
