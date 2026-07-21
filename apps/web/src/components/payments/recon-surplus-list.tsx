'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatDateTime, formatVND } from '@/lib/utils';
import { PiggyBank, Undo2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SurplusTransaction } from '@/types/entities';

/**
 * Bang tien du: giao dich ngan hang KHONG phai ban hang (ban be tra no, hoan
 * tien...). Tach hoan toan CRM, chi de luu. Chi SUPER_ADMIN bo danh dau.
 */
export function ReconSurplusList({ canApprove }: { canApprove: boolean }) {
  const [rows, setRows] = useState<SurplusTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ data: SurplusTransaction[] }>('/surplus-transactions?limit=100');
      setRows(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tải tiền dư');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function unmark(id: string) {
    if (!window.confirm('Bỏ đánh dấu? Giao dịch quay lại danh sách đối soát để ghép.')) return;
    setBusyId(id);
    try {
      await api.post(`/surplus-transactions/${id}/unmark`, {});
      toast.success('Đã bỏ đánh dấu tiền dư');
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thao tác thất bại');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Đang tải...</div>;

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
        <PiggyBank className="h-4 w-4" />
        <span className="font-semibold">{rows.length}</span> giao dịch tiền dư - tổng{' '}
        <span className="font-semibold tabular-nums">{formatVND(total)}</span>
      </div>

      {rows.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-400">Chưa có giao dịch tiền dư nào</div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <div className="w-28 shrink-0 font-semibold tabular-nums text-slate-700">{formatVND(Number(r.amount))}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-700">{r.senderName || 'Không rõ người CK'}</div>
              <div className="truncate text-slate-400">{r.content}</div>
              {r.note && <div className="truncate text-violet-600">Lý do: {r.note}</div>}
            </div>
            <div className="w-32 shrink-0 text-right text-slate-400">{formatDateTime(r.transactionTime)}</div>
            {canApprove && (
              <button
                type="button"
                onClick={() => unmark(r.id)}
                disabled={busyId === r.id}
                title="Bỏ đánh dấu tiền dư"
                className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                Bỏ đánh dấu
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
