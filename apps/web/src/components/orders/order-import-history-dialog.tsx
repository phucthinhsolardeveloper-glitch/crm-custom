'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  ImportBatchSummaryCards, ImportBatchErrorTable, ImportBatchPaymentTable,
  type ImportBatch, type ImportBatchDetail,
} from './order-import-history-detail-tables';

/** Nút + hộp thoại xem lịch sử các đợt import đơn hàng (mỗi lần Xác nhận = 1 đợt). */
export function OrderImportHistoryDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [detail, setDetail] = useState<ImportBatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async (cursor?: string) => {
    setLoading(true); setError(null);
    try {
      const qs = cursor ? `?cursor=${cursor}` : '';
      const res = await fetch(`/api/proxy/payments/import-history${qs}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) { setError(json?.message || 'Không tải được lịch sử.'); return; }
      setBatches((prev) => (cursor ? [...prev, ...json.data] : json.data));
      setNextCursor(json.meta?.nextCursor);
    } catch {
      setError('Không kết nối được máy chủ.');
    } finally { setLoading(false); }
  }, []);

  const loadDetail = async (id: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/proxy/payments/import-history/${id}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) { setError(json?.message || 'Không tải được chi tiết.'); return; }
      setDetail(json.data);
    } catch {
      setError('Không kết nối được máy chủ.');
    } finally { setLoading(false); }
  };

  // Mở dialog lần đầu -> tải danh sách
  useEffect(() => {
    if (open) { setDetail(null); void loadList(); }
  }, [open, loadList]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="h-4 w-4 mr-1" />
        Lịch sử import
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail && (
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDetail(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {detail ? `Đợt import #${detail.id} - ${detail.fileName}` : 'Lịch sử import đơn hàng'}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${formatDateTime(detail.createdAt)} - ${detail.uploader?.name ?? ''}`
                : 'Mỗi dòng = 1 lần xác nhận import. Bấm vào dòng để xem chi tiết lỗi và đơn đã tạo.'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && batches.length === 0 && !detail && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          )}

          {!detail ? (
            <BatchListTable
              batches={batches}
              loading={loading}
              nextCursor={nextCursor}
              onSelect={(id) => void loadDetail(id)}
              onLoadMore={() => void loadList(nextCursor)}
            />
          ) : (
            <div className="space-y-4">
              <ImportBatchSummaryCards batch={detail} />
              <ImportBatchErrorTable errors={detail.errors ?? []} />
              <ImportBatchPaymentTable payments={detail.payments} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Bảng danh sách các đợt import. */
function BatchListTable({ batches, loading, nextCursor, onSelect, onLoadMore }: {
  batches: ImportBatch[];
  loading: boolean;
  nextCursor?: string;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
}) {
  if (!loading && batches.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Chưa có đợt import nào.</p>;
  }
  return (
    <div>
      <div className="rounded-md border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Thời gian</th>
              <th className="px-3 py-2 text-left">File</th>
              <th className="px-3 py-2 text-left">Người import</th>
              <th className="px-3 py-2 text-right">Tổng dòng</th>
              <th className="px-3 py-2 text-right">Tạo được</th>
              <th className="px-3 py-2 text-right">Lỗi</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr
                key={b.id}
                onClick={() => onSelect(b.id)}
                className="border-t border-slate-100 cursor-pointer hover:bg-sky-50"
              >
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
                <td className="px-3 py-2 max-w-[220px] truncate" title={b.fileName}>{b.fileName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{b.uploader?.name ?? '-'}</td>
                <td className="px-3 py-2 text-right">{b.totalRows}</td>
                <td className="px-3 py-2 text-right text-emerald-600 font-medium">{b.createdCount}</td>
                <td className={`px-3 py-2 text-right ${b.errorCount > 0 ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                  {b.errorCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Tải thêm
          </Button>
        </div>
      )}
    </div>
  );
}

/** DD/MM/YYYY HH:mm theo chuẩn hiển thị của dự án. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
