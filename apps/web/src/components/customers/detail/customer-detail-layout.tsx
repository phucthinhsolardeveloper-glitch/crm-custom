import type { ReactNode } from 'react';

/**
 * Layout 2 cột cho trang Customer Detail Hybrid:
 * - Desktop (>= lg): sidebar 280px sticky bên trái, main flex bên phải.
 * - Mobile (< lg): stack dọc, sidebar lên trên với border-bottom thay border-right.
 */
export function CustomerDetailLayout({
  sidebar,
  main,
}: {
  sidebar: ReactNode;
  main: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0 bg-slate-50 min-h-[calc(100vh-4rem)] -mx-6 -my-6">
      <aside className="bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-5 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        {sidebar}
      </aside>
      <main className="px-6 lg:px-8 py-6 min-w-0">{main}</main>
    </div>
  );
}
