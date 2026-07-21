'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Braces } from 'lucide-react';
import { api } from '@/lib/api-client';
import { LarkSyncLogJsonDialog } from './lark-sync-log-json-dialog';

export interface LarkSyncLogItem {
  id: string;
  paymentId: string;
  orderId: string | null;
  mappingId: string | null;
  channelName: string;
  tableId: string | null;
  status: 'SUCCESS' | 'FAILED';
  requestPayload: Record<string, unknown> | null;
  larkResponse: unknown;
  larkRecordId: string | null;
  errorMessage: string | null;
  syncedAt: string;
}

interface Meta { total: number; page: number; limit: number; totalPages: number }
interface ChannelOption { id: string; name: string }
interface Props { channels: ChannelOption[] }

const PAGE_SIZE = 20;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Tab lich su dong bo Lark: bang + loc + phan trang + popup xem JSON. */
export function LarkSyncHistoryTab({ channels }: Props) {
  const [rows, setRows] = useState<LarkSyncLogItem[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'all' | 'success' | 'failed'>('all');
  const [mappingId, setMappingId] = useState('');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<LarkSyncLogItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), status });
      if (mappingId) params.set('mappingId', mappingId);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get<{ data: LarkSyncLogItem[]; meta: Meta }>(`/lark-sync/history?${params}`);
      setRows(res.data);
      setMeta(res.meta);
    } catch {
      setRows([]);
      setMeta({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, status, mappingId, search]);

  useEffect(() => { load(); }, [load]);

  const resetToFirstPage = () => setPage(1);
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  const pageNumbers: number[] = [];
  let from = Math.max(1, meta.page - 2);
  const to = Math.min(meta.totalPages, from + 4);
  from = Math.max(1, to - 4);
  for (let p = from; p <= to; p++) pageNumbers.push(p);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Bo loc */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && resetToFirstPage()}
          placeholder="Tìm theo mã thanh toán / mã đơn / record..."
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as typeof status); resetToFirstPage(); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="success">Thành công</option>
          <option value="failed">Thất bại</option>
        </select>
        <select
          value={mappingId}
          onChange={(e) => { setMappingId(e.target.value); resetToFirstPage(); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="">Tất cả kênh</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-lg"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Bang */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-bold text-slate-500 uppercase">
              <th className="px-5 py-3">Thời gian</th>
              <th className="px-5 py-3">Mã thanh toán</th>
              <th className="px-5 py-3">Kênh Lark</th>
              <th className="px-5 py-3 w-28">Trạng thái</th>
              <th className="px-5 py-3">Record ID / Lỗi</th>
              <th className="px-5 py-3 w-28 text-right">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-sm">
                  {loading ? 'Đang tải...' : 'Chưa có lịch sử đồng bộ nào khớp bộ lọc.'}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-sky-50/30">
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{formatTime(r.syncedAt)}</td>
                <td className="px-5 py-3 font-semibold">
                  {/* Click ma thanh toan -> mo chi tiet don chua payment do (payment hien trong trang order) */}
                  {r.orderId ? (
                    <Link
                      href={`/orders/${r.orderId}`}
                      className="text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      TT-{r.paymentId}
                    </Link>
                  ) : (
                    <span className="text-slate-700">TT-{r.paymentId}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-slate-600">{r.channelName}</td>
                <td className="px-5 py-3">
                  {r.status === 'SUCCESS' ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700">Thành công</span>
                  ) : (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700">Thất bại</span>
                  )}
                </td>
                <td className="px-5 py-3 max-w-xs">
                  {r.status === 'SUCCESS' ? (
                    <code className="text-xs text-slate-500">{r.larkRecordId}</code>
                  ) : (
                    <span className="text-xs text-red-600 line-clamp-2">{r.errorMessage}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setViewing(r)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded"
                  >
                    <Braces className="w-3.5 h-3.5" />
                    Xem JSON
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phan trang */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          Hiển thị <span className="font-semibold text-slate-700">{start}-{end}</span> trong tổng{' '}
          <span className="font-semibold text-slate-700">{meta.total}</span> bản ghi
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={meta.page <= 1}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
          >
            ‹ Trước
          </button>
          {pageNumbers.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 text-sm rounded-lg ${
                p === meta.page ? 'bg-sky-500 text-white font-bold' : 'border border-slate-200 hover:bg-slate-50 text-slate-600'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages || 1, p + 1))}
            disabled={meta.page >= meta.totalPages}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
          >
            Sau ›
          </button>
        </div>
      </div>

      {viewing && <LarkSyncLogJsonDialog log={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
