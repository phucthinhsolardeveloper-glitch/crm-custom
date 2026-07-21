'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

/** Kết quả import trả về từ POST /payments/import. */
interface ImportError {
  row: number;
  phone: string;
  reason: string;
}
interface ImportResult {
  total: number;
  created: number;
  newCustomers: number;
  newOrders: number;
  valid: number;
  dryRun: boolean;
  errors: ImportError[];
}

type Phase = 'idle' | 'previewed';

/** Nút + hộp thoại import đơn hàng từ CSV/Excel. 2 bước: kiểm tra (dryRun) -> xác nhận ghi. */
export function OrderCsvImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPhase('idle');
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  /** Gọi endpoint import với cờ dryRun. Trả về ImportResult hoặc null nếu lỗi. */
  const callImport = async (dryRun: boolean): Promise<ImportResult | null> => {
    if (!file) return null;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/proxy/payments/import?dryRun=${dryRun}`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.message || 'Xử lý thất bại. Vui lòng kiểm tra lại file.');
      return null;
    }
    return json.data as ImportResult;
  };

  // Bước 1: kiểm tra (không ghi)
  const handleCheck = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await callImport(true);
      if (data) { setPreview(data); setPhase('previewed'); }
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally { setLoading(false); }
  };

  // Bước 2: xác nhận ghi thật
  const handleConfirm = async () => {
    setLoading(true); setError(null);
    try {
      const data = await callImport(false);
      if (data) { setResult(data); router.refresh(); }
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1" />
        Import CSV/Excel
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import đơn hàng từ CSV/Excel</DialogTitle>
            <DialogDescription>
              Bước 1 kiểm tra file (chưa ghi), bước 2 xác nhận mới tạo đơn thật. Mỗi dòng cần:
              SĐT, Sản phẩm (đúng tên trong hệ thống), Số tiền. Cột &quot;Bảng Lark&quot; (tuỳ chọn):
              điền đúng tên bảng Lark để đơn tự đổ dữ liệu về Lark.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <a
              href="/api/proxy/payments/import-template"
              className="inline-flex items-center text-sm text-sky-600 hover:underline"
            >
              <Download className="h-4 w-4 mr-1" />
              Tải file mẫu (xem đúng thứ tự cột)
            </a>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPhase('idle'); setPreview(null); setResult(null); setError(null);
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0
                file:bg-sky-50 file:px-3 file:py-2 file:text-sky-700 hover:file:bg-sky-100"
            />

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Kết quả cuối (sau khi ghi thật) ưu tiên hiển thị; nếu chưa, hiện preview. */}
            {result ? <ResultSummary result={result} />
              : preview ? <PreviewSummary preview={preview} /> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); reset(); }}>
              {result ? 'Xong' : 'Huỷ'}
            </Button>

            {/* Chưa kiểm tra -> nút Kiểm tra. Đã có preview + còn dòng hợp lệ + chưa ghi -> nút Xác nhận. */}
            {!result && phase === 'idle' && (
              <Button size="sm" onClick={handleCheck} disabled={!file || loading}>
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {loading ? 'Đang kiểm tra...' : 'Kiểm tra file'}
              </Button>
            )}
            {!result && phase === 'previewed' && (
              <Button size="sm" onClick={handleConfirm} disabled={loading || (preview?.valid ?? 0) === 0}>
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {loading ? 'Đang tạo...' : `Xác nhận tạo ${preview?.valid ?? 0} đơn`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Bảng preview sau bước kiểm tra: số dòng hợp lệ / lỗi + danh sách lỗi. */
function PreviewSummary({ preview }: { preview: ImportResult }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-slate-800">
        <ClipboardCheck className="h-4 w-4 text-sky-600" />
        Kiểm tra {preview.total} dòng: <b className="text-emerald-600">{preview.valid} hợp lệ</b>
        {preview.errors.length > 0 && <span className="text-red-600">, {preview.errors.length} lỗi</span>}
      </div>
      {preview.valid > 0 && (
        <p className="mt-1 text-xs text-slate-500">Bấm &quot;Xác nhận&quot; để tạo {preview.valid} đơn hợp lệ. Dòng lỗi sẽ bị bỏ qua.</p>
      )}
      <ErrorTable errors={preview.errors} />
    </div>
  );
}

/** Bảng kết quả sau khi ghi thật. */
function ResultSummary({ result }: { result: ImportResult }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-slate-800">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Đã tạo {result.created}/{result.total} đơn
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
        <li>Khách mới: <b>{result.newCustomers}</b></li>
        <li>Đơn mới: <b>{result.newOrders}</b></li>
        <li>Lỗi: <b className={result.errors.length ? 'text-red-600' : ''}>{result.errors.length}</b></li>
      </ul>
      <ErrorTable errors={result.errors} />
    </div>
  );
}

/** Bảng liệt kê dòng lỗi (dùng chung cho preview + kết quả). */
function ErrorTable({ errors }: { errors: ImportError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="mt-3 max-h-40 overflow-auto rounded border border-red-100">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-red-50 text-red-700">
          <tr>
            <th className="px-2 py-1 text-left">Dòng</th>
            <th className="px-2 py-1 text-left">SĐT</th>
            <th className="px-2 py-1 text-left">Lý do</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={i} className="border-t border-red-50">
              <td className="px-2 py-1">{e.row}</td>
              <td className="px-2 py-1">{e.phone || '-'}</td>
              <td className="px-2 py-1 text-slate-700">{e.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
