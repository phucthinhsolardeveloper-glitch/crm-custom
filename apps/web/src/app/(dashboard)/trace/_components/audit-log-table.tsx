'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AuditLogResponse } from '@crm/types';
import { formatDateTime } from './format-helpers';

interface Props {
  rows: AuditLogResponse[];
  nextCursor?: string;
  loading: boolean;
  onLoadMore: () => void;
}

const METHOD_COLORS: Record<string, string> = {
  POST: 'bg-sky-100 text-sky-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-rose-100 text-rose-700',
};

function statusColor(code: number | null) {
  if (code == null) return 'bg-slate-100 text-slate-600';
  if (code < 300) return 'bg-emerald-100 text-emerald-700';
  if (code < 400) return 'bg-sky-100 text-sky-700';
  if (code < 500) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

export function AuditLogTable({ rows, nextCursor, loading, onLoadMore }: Props) {
  const [selected, setSelected] = useState<AuditLogResponse | null>(null);

  if (rows.length === 0 && !loading) {
    return <div className="mt-4 text-center text-sm text-slate-500 py-8">Không có dữ liệu</div>;
  }

  return (
    <>
      <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Thời gian</th>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Action</th>
              <th className="text-left px-3 py-2">Method / Path</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">IP</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                <td className="px-3 py-2">
                  {row.user ? (
                    <div>
                      <div className="font-medium">{row.user.name}</div>
                      <div className="text-xs text-slate-500">{row.user.departmentName ?? '-'}</div>
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                <td className="px-3 py-2">
                  {row.method && (
                    <span className={`inline-block mr-2 px-2 py-0.5 rounded text-xs font-semibold ${METHOD_COLORS[row.method] ?? 'bg-slate-100'}`}>
                      {row.method}
                    </span>
                  )}
                  <span className="text-xs text-slate-600 font-mono">{row.path ?? '-'}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge className={statusColor(row.statusCode)}>{row.statusCode ?? '-'}</Badge>
                </td>
                <td className="px-3 py-2 hidden md:table-cell text-xs font-mono text-slate-500">{row.ipAddress ?? '-'}</td>
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
            <DialogTitle>Chi tiết audit log #{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="text-sm space-y-2 max-h-[70vh] overflow-y-auto">
              <DetailRow label="Thời gian" value={formatDateTime(selected.createdAt)} />
              <DetailRow label="User" value={selected.user ? `${selected.user.name} (${selected.user.email})` : '-'} />
              <DetailRow label="Phòng ban" value={selected.user?.departmentName ?? '-'} />
              <DetailRow label="Action" value={selected.action} mono />
              <DetailRow label="Method / Path" value={`${selected.method ?? '-'} ${selected.path ?? ''}`} mono />
              <DetailRow label="Status" value={String(selected.statusCode ?? '-')} />
              <DetailRow label="Entity" value={selected.entityType ? `${selected.entityType} #${selected.entityId ?? '-'}` : '-'} />
              <DetailRow label="IP" value={selected.ipAddress ?? '-'} mono />
              <DetailRow label="User agent" value={selected.userAgent ?? '-'} mono />
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

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-slate-500">{label}</div>
      <div className={`col-span-2 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}
