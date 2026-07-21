'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { ReconStepDateRange } from '@/components/payments/recon-step-daterange';
import { ReconStepUpload } from '@/components/payments/recon-step-upload';
import { ReconStepResults } from '@/components/payments/recon-step-results';
import type { ReconciliationResult } from '@/types/entities';

/**
 * Đối soát 3 bước: chọn thời gian (#buoc-1) -> tải sao kê (#buoc-2) -> kết quả
 * (#buoc-3). Bước hiện tại nằm trên URL hash nên back/forward + bookmark chạy
 * đúng. Từ Lịch sử "Chạy lại" -> điều hướng kèm ?from=&to=&run=1 để tự chạy.
 */

const STEPS = [
  { num: 1, label: 'Chọn thời gian' },
  { num: 2, label: 'Tải sao kê' },
  { num: 3, label: 'Kết quả đối soát' },
];

// Đọc số bước từ hash (#buoc-N), mặc định 1.
function stepFromHash(): number {
  const m = /buoc-([123])/.exec(window.location.hash);
  return m ? Number(m[1]) : 1;
}

function ReconciliationView() {
  const { user } = useAuth();
  const canApprove = user?.role === 'SUPER_ADMIN';
  const searchParams = useSearchParams();

  // "Chạy lại" từ Lịch sử: ?from=&to=&run=1. Nạp range đồng bộ ngay từ đầu để
  // guard không đá về bước 1 trước khi chạy (và giữ loading=true tức thì).
  const rerun = searchParams.get('run') === '1' ? {
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  } : null;
  const rerunValid = !!(rerun && rerun.from && rerun.to);

  const [step, setStep] = useState(1);
  const [range, setRange] = useState<{ from: string; to: string; bankAccount?: string } | null>(
    rerunValid ? rerun : null,
  );
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loading, setLoading] = useState(rerunValid);

  // Điều hướng bước = ghi hash; trình duyệt tự thêm history entry.
  // ponytail: hash trực tiếp, không cần router.push cho fragment.
  const goStep = useCallback((n: number) => {
    window.location.hash = `buoc-${n}`;
  }, []);

  // Đồng bộ step theo hash (đọc lần đầu + mỗi lần hashchange do back/forward).
  useEffect(() => {
    const sync = () => setStep(stepFromHash());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // Guard: nhảy thẳng #buoc-2/3 khi chưa có dữ liệu -> ép về bước hợp lệ.
  // Bỏ qua khi đang loading để không đá luồng "Chạy lại" (result về sau).
  useEffect(() => {
    if (loading) return;
    if (step >= 2 && !range) goStep(1);
    else if (step === 3 && !result && range) goStep(2);
  }, [step, range, result, loading, goStep]);

  function handleRange(from: string, to: string, bankAccount?: string) {
    setRange({ from, to, bankAccount });
    goStep(2);
  }

  // Bắt đầu phiên mới (bước 2 -> 3): chạy + lưu 1 dòng lịch sử.
  const runReconciliation = useCallback(async (r: { from: string; to: string; bankAccount?: string }) => {
    setLoading(true);
    try {
      const res = await api.post<{ data: ReconciliationResult }>('/payments/reconciliation/runs', r);
      setResult(res.data);
      goStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi đối soát');
    } finally {
      setLoading(false);
    }
  }, [goStep]);

  // Refetch sau khi duyệt/ghép cặp: GET thường, KHÔNG tạo run rác.
  async function refetchResult() {
    if (!range) return;
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (range.bankAccount) params.set('bankAccount', range.bankAccount);
      const res = await api.get<{ data: ReconciliationResult }>(`/payments/reconciliation?${params.toString()}`);
      setResult(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tải lại');
    }
  }

  // "Chạy lại" từ Lịch sử: range đã nạp sẵn ở trên -> chạy ngay 1 lần.
  useEffect(() => {
    if (rerunValid) void runReconciliation(rerun!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mb-5 flex gap-2">
        {STEPS.map((s) => {
          const state = step === s.num ? 'active' : step > s.num ? 'done' : 'idle';
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => state === 'done' && goStep(s.num)}
              className={`flex flex-1 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                state === 'active'
                  ? 'border-sky-300 bg-sky-50 text-sky-700'
                  : state === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-400'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  state === 'active' ? 'bg-sky-500 text-white' : state === 'done' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {s.num}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {step === 1 && <ReconStepDateRange onConfirm={handleRange} />}
      {step === 2 && <ReconStepUpload onReconcile={() => range && runReconciliation(range)} reconciling={loading} />}
      {step === 3 && result && (
        <ReconStepResults result={result} canApprove={canApprove} onApproved={refetchResult} />
      )}
    </>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={null}>
      <ReconciliationView />
    </Suspense>
  );
}
