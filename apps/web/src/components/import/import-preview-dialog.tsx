'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const API_BASE = '/api/proxy';

export interface PreviewRow {
  row: number;
  status: 'ok' | 'warning' | 'error';
  cells: string[];
  message: string;
}

export interface PreviewSummary {
  totalRows: number;
  validRows: number;
  warningRows?: number;
  errorRows: number;
  headers?: string[];
  rows?: PreviewRow[];
  previewLimited?: boolean;
}

export interface PreviewJob {
  id: string;
  type: string;
  errorFileUrl?: string | null;
  previewSummary?: PreviewSummary | null;
}

interface Props {
  job: PreviewJob | null;
  onConfirm: (job: PreviewJob) => Promise<void>;
  onCancel: (job: PreviewJob) => Promise<void>;
}

// Màu nền + chữ cho từng trạng thái dòng (đỏ = lỗi, vàng = cảnh báo, trắng = hợp lệ).
const ROW_STYLE: Record<PreviewRow['status'], string> = {
  error: 'bg-red-50 hover:bg-red-100',
  warning: 'bg-amber-50 hover:bg-amber-100',
  ok: 'hover:bg-slate-50',
};
const REASON_STYLE: Record<PreviewRow['status'], string> = {
  error: 'text-red-700',
  warning: 'text-amber-700',
  ok: 'text-slate-400',
};

export function ImportPreviewDialog({ job, onConfirm, onCancel }: Props) {
  const [pending, setPending] = useState<'confirm' | 'cancel' | null>(null);
  const open = job !== null;
  const summary = job?.previewSummary ?? null;
  const valid = summary?.validRows ?? 0;
  const warnings = summary?.warningRows ?? 0;
  const errors = summary?.errorRows ?? 0;
  const total = summary?.totalRows ?? 0;
  const cleanRows = Math.max(valid - warnings, 0);
  const headers = summary?.headers ?? [];
  const rows = summary?.rows ?? [];
  const previewLimited = summary?.previewLimited ?? false;
  const importDisabled = valid === 0 || pending !== null;

  async function handleConfirm() {
    if (!job) return;
    setPending('confirm');
    try {
      await onConfirm(job);
    } finally {
      setPending(null);
    }
  }

  async function handleCancel() {
    if (!job) return;
    setPending('cancel');
    try {
      await onCancel(job);
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Block dismissal via outside click - user must choose explicitly.
        if (!o && pending === null && job) {
          handleCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-5xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Kết quả kiểm tra file</DialogTitle>
          <DialogDescription>
            Đã kiểm tra {total} dòng. Xác nhận để import {valid} dòng hợp lệ (gồm cả dòng có cảnh báo).
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-4">
            {/* 3 thẻ tổng kết: hợp lệ / cảnh báo / lỗi */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-medium">Hợp lệ</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{cleanRows}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-medium">Cảnh báo (thiếu nhóm)</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-amber-700">{warnings}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs font-medium">Lỗi (bị loại)</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-red-700">{errors}</p>
              </div>
            </div>

            {/* Chú thích màu */}
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-3 w-3 rounded border border-slate-200 bg-white" /> Hợp lệ
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-3 w-3 rounded border border-amber-200 bg-amber-100" /> Cảnh báo - vẫn import
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-3 w-3 rounded border border-red-200 bg-red-100" /> Lỗi - bị loại
              </span>
            </div>

            {/* Bảng giống Excel, tô màu theo trạng thái */}
            {rows.length > 0 && (
              <div className="max-h-[400px] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full whitespace-nowrap text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right">#</th>
                      {headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left">
                          {h}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left">Trạng thái / Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.row} className={ROW_STYLE[r.status]}>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.row}</td>
                        {r.cells.map((c, i) => (
                          <td key={i} className="px-3 py-1.5 text-slate-700">
                            {c}
                          </td>
                        ))}
                        <td className={`px-3 py-1.5 font-medium ${REASON_STYLE[r.status]}`}>
                          {r.status === 'ok' ? 'Hợp lệ' : r.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ghi chú giới hạn + nút tải file đầy đủ */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                {previewLimited
                  ? `Chỉ hiển thị ${rows.length} dòng đầu. Tải file đầy đủ để xem/sửa toàn bộ.`
                  : `Hiển thị ${rows.length} dòng.`}
              </span>
              {job?.errorFileUrl && (
                <a
                  href={`${API_BASE}/imports/${job.id}/error-file`}
                  download
                  className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Tải file đầy đủ (.csv)
                </a>
              )}
            </div>

            {valid === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Toàn bộ dòng đều lỗi - không thể import. Hãy sửa file rồi upload lại.
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Đang chuẩn bị kết quả...
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={pending !== null}>
            {pending === 'cancel' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Huỷ
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={importDisabled}
            className="bg-sky-600 text-white hover:bg-sky-700"
          >
            {pending === 'confirm' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Import {valid} dòng hợp lệ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
