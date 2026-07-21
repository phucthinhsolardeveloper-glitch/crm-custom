'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatDateTime, formatVND } from '@/lib/utils';
import { History, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import type { ReconciliationRun } from '@/types/entities';

/**
 * Lich su cac lan doi soat (ban tom tat nhe). Bam "Chay lai" -> nap lai range va
 * chay doi soat tuoi (chi tiet tinh tu du lieu song, khong snapshot).
 */
const PAGE_SIZE = 20;

export function ReconHistoryList({ onRerun }: { onRerun: (from: string, to: string) => void }) {
  const [rows, setRows] = useState<ReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  // Cursor-based: trang đầu load ngay, các trang sau qua nút "Tải thêm".
  async function loadPage(nextCursor?: string) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (nextCursor) params.set('cursor', nextCursor);
    const res = await api.get<{ data: ReconciliationRun[]; meta: { nextCursor?: string } }>(
      `/payments/reconciliation/runs?${params.toString()}`,
    );
    setRows((prev) => (nextCursor ? [...prev, ...res.data] : res.data));
    setCursor(res.meta?.nextCursor);
  }

  useEffect(() => {
    loadPage()
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Lỗi tải lịch sử'))
      .finally(() => setLoading(false));
  }, []);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      await loadPage(cursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tải thêm');
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Đang tải...</div>;
  if (rows.length === 0) return <div className="py-10 text-center text-sm text-slate-400">Chưa có lần đối soát nào</div>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
        <History className="h-4 w-4" />
        Đang hiển thị {rows.length} lần đối soát{cursor ? ' (còn nữa)' : ''}
      </div>

      {rows.map((r) => {
        const s = r.summary;
        return (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-700">
                {formatDateTime(r.fromDate)} - {formatDateTime(r.toDate)}
              </div>
              <div className="text-slate-400">
                {s.saleTxTotal} phiếu Sale / {s.bankTxTotal} giao dịch NH - khớp {s.mappedGrandTotal}/{s.pairGrandTotal}
                {s.grandDiff !== 0 && (
                  <span className="ml-1 text-amber-600">lệch {formatVND(Math.abs(s.grandDiff))}</span>
                )}
              </div>
            </div>
            <div className="w-32 shrink-0 text-right text-slate-400">chạy: {formatDateTime(r.runAt)}</div>
            <button
              type="button"
              onClick={() => onRerun(r.fromDate, r.toDate)}
              title="Chạy lại đối soát khoảng này"
              className="flex shrink-0 items-center gap-1 rounded-md border border-sky-200 px-2 py-1.5 text-sky-600 hover:bg-sky-50"
            >
              <RotateCw className="h-3 w-3" />
              Chạy lại
            </button>
          </div>
        );
      })}

      {cursor && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-1 self-center rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingMore ? 'Đang tải...' : 'Tải thêm'}
        </button>
      )}
    </div>
  );
}
