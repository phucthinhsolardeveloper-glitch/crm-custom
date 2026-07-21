'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Full-height table layout marker cho /leads page.
 *
 * Mục đích: cung cấp signal cho LeadTableExcel biết nó đang nằm trong /leads
 * unified page (vs các pool/dept page khác) để dùng flex-1 min-h-0 chain
 * fill xuống đáy thay vì max-h-[calc(100vh-280px)] mặc định.
 *
 * Hành vi:
 * - Table fill tới đáy viewport, cách bottom 1 khoảng nhỏ (padding `<main p-6>`).
 * - Filter ĐÓNG: table chiếm hết space còn lại + scroll nội bộ khi nhiều data.
 * - Filter MỞ: filter expanded đẩy lên trên, table co lại nhưng vẫn fill phần còn.
 * - Pagination luôn shrink-0 dưới đáy (không bị che).
 *
 * Wrapper dùng `h-full flex flex-col` để các child có thể grow qua `flex-1 min-h-0`.
 * Yêu cầu `<main>` ở parent có chiều cao determinate (đã có `flex-1` trong dashboard layout).
 */

const InShellCtx = createContext<boolean>(false);

/** Hook trả `true` nếu component đang nằm trong <LeadsLayoutShell>. */
export function useInLeadsShell(): boolean {
  return useContext(InShellCtx);
}

/** Shell wrapper - h-full flex column. Cho phép children dùng flex-1 min-h-0
 *  để fill chiều cao remaining trong `<main>`. */
export function LeadsLayoutShell({ children }: { children: ReactNode }) {
  // -m-1 sm:-m-2 cancel padding `<main p-1 sm:p-2>` của DashboardLayout (chỉ trên /leads
  // page này) để TABLE dính sát sidebar + edges. Các dashboard page khác không bị ảnh hưởng.
  // Filter bar + label chips tự khai báo ml-0.5 trong component của chúng để cách sidebar 2px
  // (xem lead-list-advanced-filter-bar.tsx + leads-toolbar-row.tsx).
  return (
    <InShellCtx.Provider value={true}>
      <div className="flex h-full flex-col gap-0.5 -m-1 sm:-m-2">{children}</div>
    </InShellCtx.Provider>
  );
}
