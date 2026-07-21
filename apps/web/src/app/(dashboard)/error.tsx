'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-red-800">
          Đã xảy ra lỗi
        </h2>
        <p className="mb-4 text-sm text-red-600">
          {error.message || 'Không thể tải trang. Vui lòng thử lại.'}
        </p>
        <Button onClick={reset} variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
          Thử lại
        </Button>
      </div>
    </div>
  );
}
