'use client';

import { useRef, useState, useCallback } from 'react';
import { FileText, FileSignature, X, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Loại tài liệu - được encode prefix vào field `description` của lead-documents
 * (vì schema lead_documents chưa có column `kind` enum riêng).
 * Sau này muốn migrate sang column dedicated thì regex parse description đã có sẵn.
 */
export type DocumentKind = 'TAILIEU' | 'HOPDONG';

export interface PendingDocument {
  file: File;
  kind: DocumentKind;
}

interface DocumentUploadSectionProps {
  files: PendingDocument[];
  onChange: (files: PendingDocument[]) => void;
  /** Nếu đang upload (parent set true trong khi submit) -> disable input/buttons. */
  uploading?: boolean;
  /** Số file đã upload thành công trong batch hiện tại (parent set khi submit). */
  uploadedCount?: number;
}

// Validation - phải khớp với BE lead-documents.service.ts (5MB, MIME whitelist).
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ['image/', 'application/'];
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const ACCEPT_STRING = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Component pure: nhận `files` state từ parent + emit `onChange`. KHÔNG tự upload.
 * Upload do parent xử lý trong handleSubmit (sequential POST tới lead-documents endpoint).
 *
 * Validation client-side là defense layer đầu. BE vẫn check lại (5MB + MIME + extension).
 */
export function DocumentUploadSection({ files, onChange, uploading = false, uploadedCount = 0 }: DocumentUploadSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const next: PendingDocument[] = [...files];
    const rejected: string[] = [];

    Array.from(incoming).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: vượt 5MB`);
        return;
      }
      // Trust MIME hơn extension (vì rename .exe -> .pdf vẫn lộ ra mime sai)
      const mimeOk = ALLOWED_MIMES.has(file.type) ||
        (file.type === '' && ALLOWED_MIME_PREFIXES.some((p) => p === '')); // fallback empty MIME
      if (!mimeOk && file.type !== '') {
        rejected.push(`${file.name}: định dạng không hỗ trợ`);
        return;
      }
      // Mặc định kind = TAILIEU. User đổi sau qua dropdown bên cạnh.
      next.push({ file, kind: 'TAILIEU' });
    });

    if (rejected.length > 0) {
      toast.error(`Bỏ qua ${rejected.length} file:\n${rejected.join('\n')}`);
    }
    onChange(next);
  }, [files, onChange]);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      // Reset input để chọn cùng file 2 lần liên tiếp vẫn trigger onChange
      e.target.value = '';
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleKindChange(index: number, kind: DocumentKind) {
    const next = files.slice();
    next[index] = { ...next[index], kind };
    onChange(next);
  }

  function handleRemove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-700">Tài liệu đính kèm</p>

      {/* Drag-drop area */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 px-4 py-5 text-center cursor-pointer transition-colors',
          dragOver && 'border-sky-400 bg-sky-50',
          uploading && 'opacity-60 cursor-not-allowed',
          !uploading && !dragOver && 'hover:border-sky-300 hover:bg-slate-50',
        )}
      >
        <Upload className="h-5 w-5 text-slate-400 mb-1" />
        <p className="text-xs text-slate-600">
          Kéo thả file hoặc <span className="text-sky-600 font-medium">bấm để chọn</span>
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          PDF, Word, Excel, ảnh - tối đa 5MB/file
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={handleSelect}
          disabled={uploading}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((doc, idx) => {
            const isUploaded = uploading && idx < uploadedCount;
            const isCurrent = uploading && idx === uploadedCount;
            return (
              <div
                key={`${doc.file.name}-${idx}`}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5',
                  isUploaded && 'bg-emerald-50 border-emerald-200',
                  isCurrent && 'bg-sky-50 border-sky-200',
                )}
              >
                {/* Icon theo loại */}
                {doc.kind === 'HOPDONG'
                  ? <FileSignature className="h-4 w-4 text-amber-600 shrink-0" />
                  : <FileText className="h-4 w-4 text-sky-600 shrink-0" />}

                {/* Tên file + size */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{doc.file.name}</p>
                  <p className="text-[11px] text-slate-400">{formatFileSize(doc.file.size)}</p>
                </div>

                {/* Loại - dropdown nhỏ */}
                <select
                  value={doc.kind}
                  onChange={(e) => handleKindChange(idx, e.target.value as DocumentKind)}
                  disabled={uploading}
                  className="text-xs rounded border border-slate-200 bg-white px-1.5 py-0.5 outline-none focus:border-sky-400 disabled:opacity-50"
                >
                  <option value="TAILIEU">Tài liệu</option>
                  <option value="HOPDONG">Hợp đồng</option>
                </select>

                {/* Status / xóa */}
                {isCurrent
                  ? <Loader2 className="h-4 w-4 text-sky-500 animate-spin shrink-0" />
                  : isUploaded
                    ? <span className="text-[11px] text-emerald-600 shrink-0">✓</span>
                    : (
                      <button
                        type="button"
                        onClick={() => handleRemove(idx)}
                        disabled={uploading}
                        className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                        aria-label="Xóa file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Build description string từ kind + optional note.
 * Format: `[TAILIEU]` hoặc `[HOPDONG]` đứng đầu cho dễ regex parse sau này.
 */
export function buildDocumentDescription(kind: DocumentKind, note?: string): string {
  const prefix = kind === 'HOPDONG' ? '[HOPDONG]' : '[TAILIEU]';
  return note ? `${prefix} ${note}` : prefix;
}
