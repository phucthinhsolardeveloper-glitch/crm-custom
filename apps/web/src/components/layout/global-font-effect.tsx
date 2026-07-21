'use client';

import { useGlobalFontPref } from '@/hooks/use-global-font-pref';

/**
 * Mount sớm trong layout.tsx để hydrate global font pref từ localStorage
 * và re-apply CSS var `--font-sans` lên <html>.
 *
 * Component này không render gì (return null) - chỉ side effect qua hook.
 *
 * Lý do tách thành component riêng: layout.tsx là Server Component, không dùng được
 * hook trực tiếp. Component này 'use client' nhưng nhẹ (no UI) -> không ảnh hưởng
 * tree client-side rendering của children.
 *
 * Phối hợp với fontFoucScript trong layout.tsx:
 * - Script inline trong <head> -> apply font NGAY trước React mount (tránh FOUC)
 * - GlobalFontEffect -> re-apply sau hydration với fallback chain đầy đủ từ
 *   FONT_FAMILY_CSS map (script inline dùng map rút gọn để giảm bytes blocking).
 */
export function GlobalFontEffect() {
  useGlobalFontPref();
  return null;
}
