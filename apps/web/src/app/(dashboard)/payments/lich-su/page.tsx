'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ReconHistoryList } from '@/components/payments/recon-history-list';

/**
 * Lịch sử đối soát. "Chạy lại" -> điều hướng sang trang đối soát kèm
 * ?from=&to=&run=1 (trang đó tự nạp range và chạy ngay, dừng ở #buoc-3).
 */
export default function HistoryPage() {
  const router = useRouter();

  function handleRerun(from: string, to: string) {
    const params = new URLSearchParams({ from, to, run: '1' });
    router.push(`/payments/doi-soat?${params.toString()}#buoc-3`);
  }

  return <ReconHistoryList onRerun={handleRerun} />;
}
