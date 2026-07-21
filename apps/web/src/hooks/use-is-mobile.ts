'use client';

import { useEffect, useState } from 'react';

/**
 * Detect viewport-based mobile mode dựa trên matchMedia.
 *
 * SSR-safe: trả `false` lần render đầu (server + client mount đầu), sau đó
 * `useEffect` set giá trị thật từ `window.matchMedia`. Tránh hydration mismatch
 * vì server và client render lần đầu đều ra `false`.
 *
 * Default breakpoint 768px = Tailwind `md`. Truyền số khác nếu cần dùng `lg`(1024).
 *
 * Usage:
 *   const isMobile = useIsMobile();
 *   if (isMobile) return <MobileCards />;
 *   return <DesktopTable />;
 */
export function useIsMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // `(max-width: 767px)` cho breakpoint 768 - khớp với cách Tailwind định nghĩa
    // `md:` từ 768 trở lên. Trừ 0.02 tránh edge case 1px của 1 số trình duyệt.
    const query = `(max-width: ${breakpoint - 0.02}px)`;
    const mql = window.matchMedia(query);

    setIsMobile(mql.matches);

    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // `addEventListener` cho `MediaQueryList` available trên all modern browsers.
    // Safari < 14 dùng `addListener` deprecated - fallback an toàn.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    } else {
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    }
  }, [breakpoint]);

  return isMobile;
}
