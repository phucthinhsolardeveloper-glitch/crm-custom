'use client';

import { useState, useEffect } from 'react';
import { X, Info } from 'lucide-react';

const STORAGE_KEY = 'dashboard-revenue-banner-dismissed';

export function NoteBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
    setVisible(!dismissed);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
  };

  return (
    <div
      data-testid="note-banner"
      className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 shrink-0 text-sky-600" />
        <p className="text-sm text-sky-700">
          <strong>Doanh thu</strong> (tổng công ty) gồm cả khoản bị đánh dấu sai thông tin (REJECTED).
          <strong> Doanh số</strong> KPI của sale chỉ tính khoản đã xác nhận (VERIFIED) - nên hai số có thể lệch nhau.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-lg p-1 text-sky-500 transition hover:bg-sky-100"
        aria-label="Đóng thông báo"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
