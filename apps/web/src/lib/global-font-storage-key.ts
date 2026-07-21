/**
 * Khóa localStorage cho global font preference.
 *
 * Tách riêng ra file KHÔNG có 'use client' để cả Server Component (layout.tsx
 * inline FOUC script) lẫn Client hook (use-global-font-pref) cùng import được
 * GIÁ TRỊ THẬT. Nếu import hằng số này từ module 'use client', server chỉ nhận
 * được client-reference proxy -> stringify ra chuỗi lỗi, làm hỏng inline script.
 */
export const GLOBAL_FONT_STORAGE_KEY = 'crm_global_font_v1';
