'use client';

import { usePathname } from 'next/navigation';

/**
 * Page transition: fade + truot len nhe (220ms) moi lan doi route.
 * key={pathname} ep React remount wrapper -> CSS animation .page-transition
 * (globals.css) chay lai. CSS thuan, 0 KB JS them, tu respect
 * prefers-reduced-motion qua guard trong globals.css.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition h-full">
      {children}
    </div>
  );
}
