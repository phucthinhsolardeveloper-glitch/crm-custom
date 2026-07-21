'use client';

import { useCallback, useEffect, useState } from 'react';
import { GLOBAL_FONT_STORAGE_KEY } from '@/lib/global-font-storage-key';

// Re-export để các nơi đang import từ hook này không phải đổi đường dẫn.
export { GLOBAL_FONT_STORAGE_KEY };

/**
 * Global font preference cho TOÀN BỘ giao diện CRM.
 *
 * Khác với `useTypographyPrefs` (scope bảng leads/payment):
 * - Global font + weight áp dụng cấp `<html>` -> mọi page kế thừa qua CSS vars.
 * - Persist localStorage `crm_global_font_v1` (sống tới khi user clear).
 * - Whitelist 8 font + 4 weight, validate khi hydrate để tránh CSS injection.
 *
 * FOUC prevention: layout.tsx inject inline script đọc localStorage trước khi React mount
 * và set CSS vars `--font-sans` + `--font-weight-base` trên `<html>`.
 */

export type GlobalFontKey =
  | 'plus-jakarta-sans'
  | 'inter'
  | 'roboto'
  | 'arial'
  | 'times-new-roman'
  | 'be-vietnam-pro'
  | 'nunito'
  | 'lora';

export type GlobalFontWeight = 400 | 500 | 600 | 700;

export const GLOBAL_FONT_LABELS: Record<GlobalFontKey, string> = {
  'plus-jakarta-sans': 'Plus Jakarta Sans',
  'inter': 'Inter',
  'roboto': 'Roboto',
  'arial': 'Arial',
  'times-new-roman': 'Times New Roman',
  'be-vietnam-pro': 'Be Vietnam Pro',
  'nunito': 'Nunito',
  'lora': 'Lora',
};

/** Phân loại font để group trong UI picker (Sans-serif / Serif / Vietnamese-optimized). */
export const GLOBAL_FONT_CATEGORIES: Record<GlobalFontKey, 'sans' | 'serif' | 'vietnamese'> = {
  'plus-jakarta-sans': 'sans',
  'inter': 'sans',
  'roboto': 'sans',
  'arial': 'sans',
  'times-new-roman': 'serif',
  'be-vietnam-pro': 'vietnamese',
  'nunito': 'vietnamese',
  'lora': 'vietnamese',
};

/**
 * Map font key -> CSS font-family value với fallback chain.
 *
 * Strategy:
 * - 5 font load qua `next/font/google` dùng CSS var primary (--font-jakarta, etc).
 *   Khi var unset (CSP block, race condition), fallback về tên font literal.
 * - Arial + Times New Roman web-safe -> tên literal trực tiếp.
 * - Cuối chain: `ui-sans-serif` (system font đẹp: SF Pro / Segoe UI), `sans-serif` generic.
 * - Times New Roman + Lora: serif font -> kết thúc bằng `serif`.
 */
export const FONT_FAMILY_CSS: Record<GlobalFontKey, string> = {
  'plus-jakarta-sans': "var(--font-jakarta), 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  'inter': "var(--font-inter), 'Inter', ui-sans-serif, system-ui, sans-serif",
  'roboto': "var(--font-roboto), 'Roboto', ui-sans-serif, system-ui, sans-serif",
  'arial': "Arial, Helvetica, ui-sans-serif, sans-serif",
  'times-new-roman': "'Times New Roman', Times, ui-serif, serif",
  'be-vietnam-pro': "var(--font-be-vietnam), 'Be Vietnam Pro', ui-sans-serif, system-ui, sans-serif",
  'nunito': "var(--font-nunito), 'Nunito', ui-sans-serif, system-ui, sans-serif",
  'lora': "var(--font-lora), 'Lora', Georgia, ui-serif, serif",
};

export const DEFAULT_GLOBAL_FONT: GlobalFontKey = 'plus-jakarta-sans';
export const DEFAULT_GLOBAL_WEIGHT: GlobalFontWeight = 500;

export const GLOBAL_FONT_CSS_VAR = '--font-sans';
export const GLOBAL_WEIGHT_CSS_VAR = '--font-weight-base';

export const FONT_WEIGHT_OPTIONS: { value: GlobalFontWeight; label: string }[] = [
  { value: 400, label: 'Thường (400)' },
  { value: 500, label: 'Trung bình (500)' },
  { value: 600, label: 'Đậm vừa (600)' },
  { value: 700, label: 'Đậm (700)' },
];

interface StoredPref {
  font: GlobalFontKey;
  weight: GlobalFontWeight;
}

function isValidFontKey(value: unknown): value is GlobalFontKey {
  return typeof value === 'string' && value in GLOBAL_FONT_LABELS;
}

function isValidWeight(value: unknown): value is GlobalFontWeight {
  return value === 400 || value === 500 || value === 600 || value === 700;
}

/**
 * Apply font + weight CSS vars lên `<html>` element.
 * Export riêng để FOUC script (inline trong <head>) có thể tái sử dụng logic.
 */
export function applyGlobalFont(fontKey: GlobalFontKey, weight: GlobalFontWeight) {
  if (typeof document === 'undefined') return;
  const cssValue = FONT_FAMILY_CSS[fontKey];
  if (cssValue) {
    document.documentElement.style.setProperty(GLOBAL_FONT_CSS_VAR, cssValue);
  }
  document.documentElement.style.setProperty(GLOBAL_WEIGHT_CSS_VAR, String(weight));
}

export function useGlobalFontPref() {
  const [font, setFont] = useState<GlobalFontKey>(DEFAULT_GLOBAL_FONT);
  const [weight, setWeight] = useState<GlobalFontWeight>(DEFAULT_GLOBAL_WEIGHT);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate từ localStorage sau mount
  useEffect(() => {
    let nextFont = DEFAULT_GLOBAL_FONT;
    let nextWeight = DEFAULT_GLOBAL_WEIGHT;
    try {
      const raw = localStorage.getItem(GLOBAL_FONT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredPref>;
        if (isValidFontKey(parsed.font)) nextFont = parsed.font;
        if (isValidWeight(parsed.weight)) nextWeight = parsed.weight;
      }
    } catch {
      // parse fail -> defaults
    }
    setFont(nextFont);
    setWeight(nextWeight);
    applyGlobalFont(nextFont, nextWeight);
    setHydrated(true);
  }, []);

  const persist = useCallback((nextFont: GlobalFontKey, nextWeight: GlobalFontWeight) => {
    try {
      localStorage.setItem(
        GLOBAL_FONT_STORAGE_KEY,
        JSON.stringify({ font: nextFont, weight: nextWeight } satisfies StoredPref),
      );
    } catch {
      // quota / private mode -> silent
    }
  }, []);

  const updateFont = useCallback((next: GlobalFontKey) => {
    if (!isValidFontKey(next)) return;
    setFont(next);
    applyGlobalFont(next, weight);
    persist(next, weight);
  }, [weight, persist]);

  const updateWeight = useCallback((next: GlobalFontWeight) => {
    if (!isValidWeight(next)) return;
    setWeight(next);
    applyGlobalFont(font, next);
    persist(font, next);
  }, [font, persist]);

  const resetFont = useCallback(() => {
    setFont(DEFAULT_GLOBAL_FONT);
    setWeight(DEFAULT_GLOBAL_WEIGHT);
    applyGlobalFont(DEFAULT_GLOBAL_FONT, DEFAULT_GLOBAL_WEIGHT);
    try {
      localStorage.removeItem(GLOBAL_FONT_STORAGE_KEY);
    } catch {
      // silent
    }
  }, []);

  return { font, weight, hydrated, updateFont, updateWeight, resetFont };
}
