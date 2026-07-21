'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Layout chung cho khu vực đối soát thanh toán: tiêu đề + thanh 3 tab (route con).
 * Mỗi tab là 1 URL riêng (/payments/doi-soat|tien-du|lich-su) - active-state đọc
 * từ pathname nên share link / bookmark / back-forward đều đúng.
 */

const TABS = [
  { href: '/payments/doi-soat', label: 'Đối soát' },
  { href: '/payments/tien-du', label: 'Tiền dư' },
  { href: '/payments/lich-su', label: 'Lịch sử' },
] as const;

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-1 text-xl font-bold text-slate-800">Đối soát thanh toán</div>
      <div className="mb-4 text-sm text-slate-500">Gom theo mệnh giá chuyển khoản, đối chiếu phiếu Sale với sao kê ngân hàng.</div>

      <div className="mb-5 flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors ${
                active ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
