'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CronRunResponse } from '@crm/types';
import { formatDateTime, formatDuration } from './format-helpers';

interface Props {
  rows: CronRunResponse[];
  nextCursor?: string;
  loading: boolean;
  onLoadMore: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  RUNNING: 'bg-sky-100 text-sky-700 animate-pulse',
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700',
};

export function CronRunTable({ rows, nextCursor, loading, onLoadMore }: Props) {
  const [selected, setSelected] = useState<CronRunResponse | null>(null);

  if (rows.length === 0 && !loading) {
    return <div className="mt-4 text-center text-sm text-slate-500 py-8">Không có dữ liệu</div>;
  }

  return (
    <>
      <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Job</th>
              <th className="text-left px-3 py-2">Bắt đầu</th>
              <th className="text-left px-3 py-2">Thời lượng</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Affected</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Lỗi</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">{row.jobName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.startedAt)}</td>
                <td className="px-3 py-2">{formatDuration(row.durationMs)}</td>
                <td className="px-3 py-2">
                  <Badge className={STATUS_COLOR[row.status] ?? 'bg-slate-100'}>{row.status}</Badge>
                </td>
                <td className="px-3 py-2 text-right">{row.affected.toLocaleString('vi-VN')}</td>
                <td className="px-3 py-2 hidden md:table-cell text-xs text-rose-600 max-w-xs truncate">
                  {row.errorMsg ? row.errorMsg.split('\n')[0] : '-'}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>Xem</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loading}>
            Tải thêm
          </Button>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết cron run #{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="text-sm space-y-2 max-h-[70vh] overflow-y-auto">
              <Row label="Job" value={selected.jobName} mono />
              <Row label="Bắt đầu" value={formatDateTime(selected.startedAt)} />
              <Row label="Kết thúc" value={selected.finishedAt ? formatDateTime(selected.finishedAt) : '-'} />
              <Row label="Thời lượng" value={formatDuration(selected.durationMs)} />
              <Row label="Status" value={selected.status} />
              <Row label="Affected" value={selected.affected.toLocaleString('vi-VN')} />
              {selected.errorMsg && (
                <div>
                  <div className="text-slate-500 text-xs mt-2">Error:</div>
                  <pre className="mt-1 p-2 bg-rose-50 text-rose-900 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                    {selected.errorMsg}
                  </pre>
                </div>
              )}
              <div>
                <div className="text-slate-500 text-xs mt-2">Metadata:</div>
                <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-slate-500">{label}</div>
      <div className={`col-span-2 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}
