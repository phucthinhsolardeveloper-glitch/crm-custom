'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CUSTOMER_TABS, type CustomerTabKey } from '@/lib/customer-tabs';

interface Props {
  activeTab: CustomerTabKey;
  counts?: Partial<Record<'orders' | 'leads', number>>;
}

/**
 * Tab bar 7 mục với URL sync.
 * Client để dùng usePathname; navigation qua <Link href="?tab=..."> giúp browser back/forward hoạt động.
 */
export function CustomerTabBar({ activeTab, counts }: Props) {
  const pathname = usePathname();
  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl mb-5 flex items-stretch shadow-sm"
      role="tablist"
      aria-label="Tab khách hàng"
    >
      {CUSTOMER_TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        const count = tab.countField ? counts?.[tab.countField as 'orders' | 'leads'] : undefined;
        return (
          <Link
            key={tab.key}
            href={`${pathname}?tab=${tab.key}`}
            scroll={false}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'flex-1 px-2 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5',
              isActive
                ? 'text-sky-700 border-sky-500'
                : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-200',
            )}
          >
            {tab.label}
            {count !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-bold',
                  isActive ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500',
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
