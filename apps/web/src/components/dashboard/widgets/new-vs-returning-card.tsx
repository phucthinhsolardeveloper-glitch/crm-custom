'use client';

import { type NewVsReturningData, fmtNum, fmtPct } from '../constants';

interface NewVsReturningCardProps {
  data: NewVsReturningData | null;
  loading: boolean;
}

/**
 * Card A "Lead mới: KH cũ vs KH mới" + Card B "Convert: từ KH cũ vs KH mới".
 * Render 2 cards trong grid 2 cols. WF1 lines 270-339.
 *
 * Định nghĩa "KH cũ" = SĐT của lead đã có customer record trước đó.
 */
export function NewVsReturningCard({ data, loading }: NewVsReturningCardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[240px] animate-pulse rounded-xl bg-slate-100" />
        <div className="h-[240px] animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!data || data.newLeads.total === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EmptyCard title="Lead mới: KH cũ vs KH mới" hint="Cần ít nhất 1 lead có SĐT trong kỳ" />
        <EmptyCard title="Convert: từ KH cũ vs KH mới" hint="Chưa có convert trong kỳ" />
      </div>
    );
  }

  const { newLeads, converts } = data;
  const newPct = newLeads.total > 0 ? Math.round((newLeads.fromNew / newLeads.total) * 100) : 0;
  const returningPct = 100 - newPct;

  const cvNewPct = converts.total > 0 ? Math.round((converts.fromNew / converts.total) * 100) : 0;
  const cvReturningPct = 100 - cvNewPct;

  // Highlight ratio: cv rate KH cũ vs KH mới (vd "↑3.3x" khi cv cũ >> cv mới)
  const ratio = converts.cvRateFromNew > 0
    ? Math.round((converts.cvRateFromReturning / converts.cvRateFromNew) * 10) / 10
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Card A - Lead mới phân loại */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Lead mới: KH cũ vs KH mới</h3>
          <span className="text-xs tabular-nums text-slate-400">Tổng {fmtNum(newLeads.total)} leads</span>
        </div>
        <p className="mb-4 text-xs text-slate-500">SĐT trùng customer đã có = KH cũ quay lại</p>

        <div className="mb-4 flex h-10 overflow-hidden rounded-lg text-sm font-bold text-white">
          {newPct > 0 && (
            <div className="flex items-center justify-center" style={{ background: '#8b5cf6', width: `${newPct}%` }}>
              {newPct >= 12 && `${newPct}% KH mới`}
            </div>
          )}
          {returningPct > 0 && (
            <div className="flex items-center justify-center" style={{ background: '#14b8a6', width: `${returningPct}%` }}>
              {returningPct >= 12 && `${returningPct}% KH cũ`}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ background: '#ede9fe' }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: '#8b5cf6' }} />
              <span className="text-xs font-semibold" style={{ color: '#6d28d9' }}>KH mới (chưa mua)</span>
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: '#4c1d95' }}>{fmtNum(newLeads.fromNew)}</div>
            <div className="mt-0.5 text-xs text-slate-500">Cần nurture từ đầu</div>
          </div>
          <div className="rounded-xl p-3" style={{ background: '#ccfbf1' }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: '#14b8a6' }} />
              <span className="text-xs font-semibold" style={{ color: '#0f766e' }}>KH cũ (đã mua)</span>
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: '#134e4a' }}>{fmtNum(newLeads.fromReturning)}</div>
            <div className="mt-0.5 text-xs text-slate-500">Cơ hội upsell / cross-sell</div>
          </div>
        </div>
      </div>

      {/* Card B - Convert phân loại */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Convert: từ KH cũ vs KH mới</h3>
          <span className="text-xs tabular-nums text-slate-400">{fmtNum(converts.total)} converts</span>
        </div>
        <p className="mb-4 text-xs text-slate-500">Lead chốt đơn đến từ loại customer nào</p>

        {converts.total === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Chưa có convert trong kỳ</div>
        ) : (
          <>
            <div className="mb-4 flex h-10 overflow-hidden rounded-lg text-sm font-bold text-white">
              {cvNewPct > 0 && (
                <div className="flex items-center justify-center" style={{ background: '#0ea5e9', width: `${cvNewPct}%` }}>
                  {cvNewPct >= 12 && `${cvNewPct}% KH mới`}
                </div>
              )}
              {cvReturningPct > 0 && (
                <div className="flex items-center justify-center" style={{ background: '#10b981', width: `${cvReturningPct}%` }}>
                  {cvReturningPct >= 12 && `${cvReturningPct}% KH cũ`}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: '#e0f2fe' }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#0ea5e9' }} />
                  <span className="text-xs font-semibold" style={{ color: '#0369a1' }}>Từ KH mới</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums" style={{ color: '#0c4a6e' }}>{fmtNum(converts.fromNew)}</span>
                  <span className="text-xs text-slate-500">/ {fmtNum(newLeads.fromNew)}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  CV rate <span className="font-bold" style={{ color: '#0369a1' }}>{fmtPct(converts.cvRateFromNew)}</span>
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: '#d1fae5' }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#10b981' }} />
                  <span className="text-xs font-semibold" style={{ color: '#047857' }}>Từ KH cũ</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums" style={{ color: '#064e3b' }}>{fmtNum(converts.fromReturning)}</span>
                  <span className="text-xs text-slate-500">/ {fmtNum(newLeads.fromReturning)}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  CV rate <span className="font-bold" style={{ color: '#047857' }}>{fmtPct(converts.cvRateFromReturning)}</span>
                  {ratio != null && ratio >= 1.5 && (
                    <span className="ml-1 font-bold text-emerald-600">↑{ratio}x</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <h3 className="mb-4 text-sm font-bold text-slate-900">{title}</h3>
      <p className="py-8 text-center text-sm text-slate-400">{hint}</p>
    </div>
  );
}
