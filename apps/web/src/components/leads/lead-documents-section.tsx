'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  FileText, FileSpreadsheet, FileImage, FileType2, File as FileIcon,
  Upload, Download, Trash2, ChevronDown, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  leadDocumentsApi,
  uploadLeadDocument,
  downloadLeadDocument,
  type LeadDocumentRecord,
} from '@/lib/api/lead-documents';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';

interface Props {
  leadId: string;
}

// Sync với backend - validation client-side chỉ là UX hint nhanh.
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
]);

/**
 * Section "Tài liệu và Hợp đồng" trong LeadEditDrawer.
 *
 * UX:
 * - Collapsible, default ĐÓNG (không làm form dài; user mở khi cần).
 * - Lazy fetch: chỉ gọi API list khi section mở lần đầu (tiết kiệm request).
 * - Badge count ở header hiện cả khi đóng (sau khi đã fetch lần 1).
 * - Upload qua drop zone hoặc click chọn file (multiple).
 * - Per-file progress bar khi đang upload.
 * - Delete chỉ MANAGER+ thấy.
 */
export function LeadDocumentsSection({ leadId }: Props) {
  const { user } = useAuth();
  const isManagerPlus = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [isOpen, setIsOpen] = useState(false);
  const [docs, setDocs] = useState<LeadDocumentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await leadDocumentsApi.list(leadId);
      setDocs(res.data || []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải tài liệu');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  // Lazy fetch lần đầu khi section mở
  useEffect(() => {
    if (isOpen && !loaded && !loading) {
      fetchDocs();
    }
  }, [isOpen, loaded, loading, fetchDocs]);

  async function handleDelete(docId: string) {
    try {
      await leadDocumentsApi.remove(leadId, docId);
      toast.success('Đã xóa tài liệu');
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi khi xóa');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">Tài liệu và Hợp đồng</span>
          {loaded && docs.length > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
              {docs.length}
            </span>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-3 space-y-3">
          <UploadZone leadId={leadId} onUploaded={(doc) => setDocs((prev) => [doc, ...prev])} />

          {error ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 flex items-center justify-between">
              <span>{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={fetchDocs}>
                Thử lại
              </Button>
            </div>
          ) : loading && docs.length === 0 ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Chưa có tài liệu nào</p>
          ) : (
            <ul className="space-y-2">
              {docs.map((doc) => (
                <DocumentItem
                  key={doc.id}
                  doc={doc}
                  leadId={leadId}
                  canDelete={isManagerPlus}
                  onDelete={() => handleDelete(doc.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Upload zone ─────────────────────────────────────────────────────────────

function UploadZone({
  leadId, onUploaded,
}: {
  leadId: string;
  onUploaded: (doc: LeadDocumentRecord) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // Mỗi file đang upload: { tempId, fileName, pct, error? }
  const [queue, setQueue] = useState<Array<{ tempId: string; fileName: string; pct: number; error?: string }>>([]);

  function validateClientSide(file: File): string | null {
    if (file.size > MAX_FILE_SIZE) return `${file.name}: vượt quá 5MB`;
    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) return `${file.name}: định dạng ${ext || '?'} không hỗ trợ`;
    return null;
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      const err = validateClientSide(file);
      if (err) {
        toast.error(err);
        continue;
      }
      const tempId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setQueue((prev) => [...prev, { tempId, fileName: file.name, pct: 0 }]);
      try {
        const doc = await uploadLeadDocument(leadId, file, (pct) => {
          setQueue((prev) => prev.map((q) => q.tempId === tempId ? { ...q, pct } : q));
        });
        // Remove khỏi queue khi xong, push lên list
        setQueue((prev) => prev.filter((q) => q.tempId !== tempId));
        onUploaded(doc);
        toast.success(`Đã tải lên ${file.name}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Lỗi upload';
        setQueue((prev) => prev.map((q) => q.tempId === tempId ? { ...q, error: msg } : q));
        toast.error(`${file.name}: ${msg}`);
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
          dragOver ? 'border-sky-500 bg-sky-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50',
        )}
      >
        <Upload className="h-6 w-6 text-slate-400" />
        <p className="text-sm text-slate-600 text-center">
          Kéo thả file vào đây hoặc <span className="text-sky-600 underline">bấm để chọn</span>
        </p>
        <p className="text-xs text-slate-400 text-center">
          Hỗ trợ ảnh, PDF, Word, Excel. Tối đa 5MB/file.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(e.target.files);
              e.target.value = ''; // reset để chọn lại cùng file vẫn fire onChange
            }
          }}
        />
      </div>

      {queue.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {queue.map((q) => (
            <li key={q.tempId} className="rounded border border-slate-200 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700">{q.fileName}</span>
                <span className={cn('shrink-0 font-medium', q.error ? 'text-red-600' : 'text-slate-500')}>
                  {q.error ? 'Lỗi' : `${q.pct}%`}
                </span>
              </div>
              {!q.error && (
                <div className="mt-1 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all"
                    style={{ width: `${q.pct}%` }}
                  />
                </div>
              )}
              {q.error && <p className="mt-1 text-red-600">{q.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Document item row ──────────────────────────────────────────────────────

function DocumentItem({
  doc, leadId, canDelete, onDelete,
}: {
  doc: LeadDocumentRecord;
  leadId: string;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const Icon = pickFileIcon(doc.fileName);
  const sizeStr = formatBytes(doc.fileSize);
  const dateStr = formatDateTime(doc.createdAt);

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
      <Icon.Component className={cn('h-5 w-5 shrink-0', Icon.colorCls)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{doc.fileName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {sizeStr} · {doc.uploader?.name ?? 'Ẩn danh'} · {dateStr}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon" variant="ghost" className="h-8 w-8"
          onClick={() => downloadLeadDocument(leadId, doc.id)}
          aria-label="Tải xuống"
          title="Tải xuống"
        >
          <Download className="h-4 w-4" />
        </Button>
        {canDelete && (
          <ConfirmDialog
            trigger={
              <Button
                type="button" size="icon" variant="ghost"
                className="h-8 w-8 text-rose-600"
                aria-label="Xóa"
                title="Xóa tài liệu"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="Xóa tài liệu?"
            description={`File "${doc.fileName}" sẽ bị xóa khỏi danh sách.`}
            confirmLabel="Xóa"
            onConfirm={onDelete}
          />
        )}
      </div>
    </li>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pickFileIcon(fileName: string): { Component: typeof FileIcon; colorCls: string } {
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    return { Component: FileImage, colorCls: 'text-amber-600' };
  }
  if (ext === '.pdf') return { Component: FileType2, colorCls: 'text-red-600' };
  if (['.doc', '.docx'].includes(ext)) return { Component: FileText, colorCls: 'text-sky-600' };
  if (['.xls', '.xlsx'].includes(ext)) return { Component: FileSpreadsheet, colorCls: 'text-emerald-600' };
  return { Component: FileIcon, colorCls: 'text-slate-500' };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
