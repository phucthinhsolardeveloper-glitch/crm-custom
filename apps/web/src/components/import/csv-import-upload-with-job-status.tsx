'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Download,
  Eye,
  CircleDashed,
  ClipboardList,
  Ban,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { ImportTemplateDialog } from './import-template-dialog';
import {
  ImportPreviewDialog,
  type PreviewSummary,
  type PreviewJob,
} from './import-preview-dialog';
import { ImportProgressBar } from './import-progress-bar';
import { useFakeProgress } from '@/hooks/use-fake-progress';

// Route through Next.js proxy (same-origin) so auth cookie → Bearer token forwarding works.
const API_BASE = '/api/proxy';

type ImportStatus =
  | 'PENDING_REVIEW'
  | 'REVIEWED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

interface ImportJob {
  id: string;
  type: string;
  status: ImportStatus;
  totalRows?: number;
  successCount?: number;
  errorCount?: number;
  errorFileUrl?: string | null;
  previewSummary?: PreviewSummary | null;
  reviewedAt?: string | null;
  startedAt?: string | null;
  createdAt: string;
}

interface UploadZoneProps {
  label: string;
  endpoint: string;
  onJobCreated: (job: ImportJob) => void;
}

function UploadZone({ label, endpoint, onJobCreated }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      toast.error('Chỉ hỗ trợ file CSV');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Lỗi upload' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      // API wraps responses as { data }. Without unwrapping, job.id/status
      // would be undefined - polling updates then fail to match by id, so the
      // job never transitions to REVIEWED in state and the dialog can't auto-open
      // (forcing a manual F5).
      const json = await res.json();
      const job: ImportJob = json?.data ?? json;
      onJobCreated(job);
      toast.success(`Đã upload ${file.name}, đang kiểm tra dữ liệu...`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi upload file');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging
          ? 'border-sky-400 bg-sky-50'
          : 'border-slate-300 bg-white hover:border-sky-300 hover:bg-sky-50/30'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
        }}
      />
      <div className="flex flex-col items-center gap-3">
        {uploading ? (
          <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
        ) : (
          <Upload className="h-10 w-10 text-slate-300" />
        )}
        <div>
          <p className="font-semibold text-slate-700">{label}</p>
          <p className="mt-1 text-sm text-slate-400">
            {uploading ? 'Đang upload...' : 'Kéo thả hoặc nhấn để chọn file CSV'}
          </p>
          <p className="mt-2 text-xs text-slate-400">Hỗ trợ: .csv, tối đa 10MB</p>
        </div>
      </div>
    </div>
  );
}

const JOB_STATUS_COLORS: Record<ImportStatus, string> = {
  PENDING_REVIEW: 'bg-sky-100 text-sky-700',
  REVIEWED: 'bg-cyan-100 text-cyan-700',
  PROCESSING: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-600',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const JOB_STATUS_LABELS: Record<ImportStatus, string> = {
  PENDING_REVIEW: 'Đang kiểm tra',
  REVIEWED: 'Chờ xác nhận',
  PROCESSING: 'Đang import',
  COMPLETED: 'Hoàn thành',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã huỷ',
};

const TERMINAL_STATUSES: ImportStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'REVIEWED'];

function statusIcon(status: ImportStatus) {
  switch (status) {
    case 'PENDING_REVIEW':
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case 'REVIEWED':
      return <ClipboardList className="h-3 w-3" />;
    case 'PROCESSING':
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case 'COMPLETED':
      return <CheckCircle2 className="h-3 w-3" />;
    case 'FAILED':
      return <XCircle className="h-3 w-3" />;
    case 'CANCELLED':
      return <Ban className="h-3 w-3" />;
    default:
      return <CircleDashed className="h-3 w-3" />;
  }
}

interface JobStatusRowProps {
  job: ImportJob;
  onUpdate: (updated: ImportJob) => void;
}

function JobStatusRow({ job, onUpdate }: JobStatusRowProps) {
  const status = job.status;
  const isPolling = status === 'PENDING_REVIEW' || status === 'PROCESSING';
  const isDone = status === 'COMPLETED';
  const isFailed = status === 'FAILED';
  const progress = useFakeProgress(status === 'PROCESSING', isDone);

  // Polling: 1s while PENDING_REVIEW (dry-run is fast), 3s while PROCESSING.
  useEffect(() => {
    if (!isPolling) return;
    const intervalMs = status === 'PENDING_REVIEW' ? 1000 : 3000;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/imports/${job.id}/status`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        // API wraps payloads as { data } - older /imports/leads returns the row directly.
        const updated: ImportJob = (json && json.data) ?? json;
        onUpdate(updated);
        if (TERMINAL_STATUSES.includes(updated.status)) {
          clearInterval(interval);
          if (updated.status === 'COMPLETED') {
            toast.success(
              `Import xong: ${updated.successCount ?? 0} thành công, ${updated.errorCount ?? 0} lỗi`,
            );
          } else if (updated.status === 'FAILED') {
            toast.error('Import thất bại');
          }
        }
      } catch {
        /* swallow - next tick will retry */
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [job.id, status, isPolling, onUpdate]);

  const showProgress = status === 'PROCESSING' || (status === 'COMPLETED' && progress < 100);

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {job.type === 'leads' ? 'Import Leads' : 'Import Khách hàng'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${JOB_STATUS_COLORS[status] ?? ''}`}
        >
          {statusIcon(status)}
          {JOB_STATUS_LABELS[status] ?? status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">
        {showProgress ? (
          <ImportProgressBar progress={progress} error={isFailed} />
        ) : job.totalRows != null ? (
          <span>
            <span className="text-green-600">{job.successCount ?? 0}</span>
            {' / '}
            {job.totalRows}
            {job.errorCount ? (
              <span className="text-red-500"> ({job.errorCount} lỗi)</span>
            ) : null}
          </span>
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3">
        {job.errorFileUrl ? (
          <a
            href={`${API_BASE}/imports/${job.id}/error-file`}
            download
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            <Download className="h-3 w-3" />
            Tải lỗi
          </a>
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">{formatDateTime(job.createdAt)}</td>
    </tr>
  );
}

export function CsvImportPageClient({ initialHistory }: { initialHistory: ImportJob[] }) {
  const [jobs, setJobs] = useState<ImportJob[]>(initialHistory);
  const [templateType, setTemplateType] = useState<'lead' | 'customer' | null>(null);
  const [activePreviewJobId, setActivePreviewJobId] = useState<string | null>(null);
  // Track which jobs already triggered the dialog auto-open so we don't reopen
  // after the user manually closes it (eg by starting then refresh-during-PROCESSING).
  const dismissedRef = useRef<Set<string>>(new Set());

  // Auto-open dialog for any newly-REVIEWED job that hasn't been dismissed yet.
  useEffect(() => {
    if (activePreviewJobId) return;
    const next = jobs.find(
      (j) => j.status === 'REVIEWED' && !dismissedRef.current.has(j.id),
    );
    if (next) setActivePreviewJobId(next.id);
  }, [jobs, activePreviewJobId]);

  function handleJobCreated(job: ImportJob) {
    setJobs((prev) => [job, ...prev]);
  }

  function handleJobUpdate(updated: ImportJob) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  }

  async function handleStartImport(job: PreviewJob) {
    try {
      const res = await fetch(`${API_BASE}/imports/${job.id}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || `HTTP ${res.status}`);
      }
      const updated: ImportJob = json?.data ?? json;
      handleJobUpdate(updated);
      dismissedRef.current.add(job.id);
      setActivePreviewJobId(null);
      toast.success('Bắt đầu import...');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể bắt đầu import');
    }
  }

  async function handleCancelImport(job: PreviewJob) {
    try {
      const res = await fetch(`${API_BASE}/imports/${job.id}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || `HTTP ${res.status}`);
      }
      const updated: ImportJob = json?.data ?? json;
      handleJobUpdate(updated);
      dismissedRef.current.add(job.id);
      setActivePreviewJobId(null);
      toast.message('Đã huỷ import');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể huỷ import');
    }
  }

  const previewJob = activePreviewJobId
    ? jobs.find((j) => j.id === activePreviewJobId) ?? null
    : null;

  return (
    <div className="space-y-6">
      {/* Template preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Xem cấu trúc file mẫu</h3>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setTemplateType('lead')}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4 text-sky-500" />
            Xem mẫu Leads
          </button>
          <button
            onClick={() => setTemplateType('customer')}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4 text-emerald-500" />
            Xem mẫu Khách hàng
          </button>
        </div>
      </div>

      <ImportTemplateDialog type={templateType} onClose={() => setTemplateType(null)} />

      <ImportPreviewDialog
        job={previewJob}
        onConfirm={handleStartImport}
        onCancel={handleCancelImport}
      />

      {/* Upload zones */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UploadZone
          label="Import Leads"
          endpoint="/imports/leads"
          onJobCreated={handleJobCreated}
        />
        <UploadZone
          label="Import Khách hàng"
          endpoint="/imports/customers"
          onJobCreated={handleJobCreated}
        />
      </div>

      {/* Import history */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-800">Lịch sử import</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Chưa có lịch sử import</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Loại</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Trạng thái</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Tiến độ</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Lỗi</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobStatusRow key={job.id} job={job} onUpdate={handleJobUpdate} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
