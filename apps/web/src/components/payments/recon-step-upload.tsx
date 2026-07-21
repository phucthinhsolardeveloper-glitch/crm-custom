'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, Trash2 } from 'lucide-react';

/**
 * Bước 2: upload nhiều file sao kê. Mỗi file gọi POST /bank-transactions/import
 * (endpoint sẵn có, dedup theo externalId + nội dung tự chặn trùng chéo file).
 * Hiện tiến trình từng file. Không chặn "Đối soát" nếu có file lỗi (dedup).
 */

interface Props {
  onReconcile: () => void;
  reconciling: boolean;
}

interface FileState {
  name: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  imported?: number;
  duplicate?: number;
  outgoing?: number;
  failed?: number;
  message?: string;
}

export function ReconStepUpload({ onReconcile, reconciling }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [uploading, setUploading] = useState(false);

  async function uploadOne(file: File): Promise<FileState> {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/proxy/bank-transactions/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { name: file.name, status: 'error', message: json.message || `HTTP ${res.status}` };
      }
      const d = json.data ?? {};
      const failed = Array.isArray(d.errors) ? d.errors.length : 0;
      return {
        name: file.name,
        status: 'done',
        imported: d.imported ?? 0,
        duplicate: d.skipped_duplicate ?? 0,
        outgoing: d.skipped_outgoing ?? 0,
        failed,
        // Nếu có dòng lỗi (vd DB thiếu cột) -> nêu lý do dòng đầu để không "im lặng".
        message: failed > 0 ? d.errors[0]?.reason?.split('\n')[0] : undefined,
      };
    } catch (err) {
      return { name: file.name, status: 'error', message: err instanceof Error ? err.message : 'Lỗi tải lên' };
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    setUploading(true);
    // Hiện ngay trạng thái pending cho từng file.
    const base: FileState[] = picked.map((f) => ({ name: f.name, status: 'pending' }));
    setFiles((prev) => [...prev, ...base]);

    for (let i = 0; i < picked.length; i++) {
      setFiles((prev) => prev.map((f) => (f.name === picked[i].name && f.status === 'pending' ? { ...f, status: 'uploading' } : f)));
      const result = await uploadOne(picked[i]);
      setFiles((prev) => {
        const idx = prev.findIndex((f) => f.name === result.name && f.status === 'uploading');
        if (idx === -1) return [...prev, result];
        const copy = [...prev];
        copy[idx] = result;
        return copy;
      });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  const doneCount = files.filter((f) => f.status === 'done').length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Upload className="h-4 w-4 text-sky-500" />
        Tải lên file sao kê ngân hàng
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 py-8 text-slate-500 hover:border-sky-300 hover:bg-sky-50"
      >
        <FileSpreadsheet className="h-8 w-8 text-sky-400" />
        <span className="text-sm font-medium">Kéo thả hoặc bấm để chọn nhiều file</span>
        <span className="text-xs text-slate-400">Chấp nhận .xlsx, .xls, .csv</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              {f.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-sky-500" />}
              {f.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {f.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
              {f.status === 'pending' && <FileSpreadsheet className="h-4 w-4 text-slate-400" />}
              <span className="flex-1 truncate text-slate-700">{f.name}</span>
              {f.status === 'done' && (
                <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
                  <span className="font-medium text-emerald-600">+{f.imported ?? 0} mới</span>
                  {(f.duplicate ?? 0) > 0 && <span className="text-amber-600">{f.duplicate} trùng</span>}
                  {(f.outgoing ?? 0) > 0 && <span className="text-slate-400">{f.outgoing} tiền ra</span>}
                  {(f.failed ?? 0) > 0 && (
                    <span className="max-w-[240px] truncate text-red-500" title={f.message}>
                      {f.failed} lỗi{f.message ? `: ${f.message}` : ''}
                    </span>
                  )}
                </span>
              )}
              {f.status === 'error' && <span className="max-w-[220px] truncate text-xs text-red-500" title={f.message}>{f.message}</span>}
              <button type="button" onClick={() => removeFile(f.name)} className="text-slate-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {doneCount > 0 ? `${doneCount} file đã nạp` : 'Chưa có file nào được nạp'}
        </span>
        <Button
          onClick={onReconcile}
          disabled={uploading || reconciling}
          className="bg-sky-500 hover:bg-sky-600"
        >
          {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Đối soát ngay
        </Button>
      </div>
    </div>
  );
}
