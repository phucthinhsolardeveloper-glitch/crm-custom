'use client';

/**
 * Side-panel hiển thị danh sách khách hàng khi user click cell trong tab Bán hàng.
 * Mode (mutually exclusive):
 * - labelId: KH thuộc label X của user
 * - untouched: lead chưa có outgoing call > 0
 * - other: KH có label nhưng KHÔNG nằm trong top 7
 */

import { useEffect } from 'react';
import { type DashboardRange, fmtNum, fmtVND, fmtRangeLabel } from '../constants';
import { useCustomerDrillDown, type DrillDownMode } from '../hooks/use-customer-drill-down';

interface Props {
  open: boolean;
  userId: string | null;
  userName?: string;
  mode: DrillDownMode | null;
  modeLabel?: string;
  range: DashboardRange;
  onClose: () => void;
}

export function CustomerDrillDownPanel({
  open,
  userId,
  userName,
  mode,
  modeLabel,
  range,
  onClose,
}: Props) {
  const { items, total, hasMore, loading, loadingMore, error, loadMore } = useCustomerDrillDown(
    open ? userId : null,
    open ? mode : null,
    range,
  );

  // Khoá scroll body khi panel mở
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // Đóng panel với phím Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Overlay - click để đóng */}
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity"
      />

      {/* Side panel */}
      <aside
        className="fixed right-0 top-0 z-50 h-full w-full sm:w-[480px] bg-white shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <header className="border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-sky-600 uppercase tracking-wide">
              {modeLabel || 'Danh sách khách hàng'}
            </div>
            <div className="text-base font-bold text-slate-900 mt-0.5 truncate">
              {userName || 'Nhân viên'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Phạm vi: {fmtRangeLabel(range.from)} - {fmtRangeLabel(range.to)} · {loading ? '...' : `${fmtNum(total)} KH`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Đóng panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100" />
            ))
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-12">
              Không có khách hàng nào phù hợp
            </div>
          ) : (
            items.map(c => (
              <div
                key={c.id}
                className="rounded-lg border border-slate-100 bg-white p-3 hover:border-sky-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{c.phone}</div>
                  </div>
                  {c.ordersCount > 0 && (
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-emerald-600">{fmtVND(c.totalRevenue)}</div>
                      <div className="text-[10px] text-slate-400">{c.ordersCount} đơn</div>
                    </div>
                  )}
                </div>
                {c.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.labels.map(l => (
                      <span
                        key={l.id}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: l.color }}
                      >
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
                {c.lastActivityAt && (
                  <div className="text-[10px] text-slate-400 mt-2">
                    Hoạt động cuối: {new Date(c.lastActivityAt).toLocaleString('vi-VN')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer pagination */}
        {hasMore && !loading && (
          <footer className="border-t border-slate-100 p-3">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? 'Đang tải...' : 'Tải thêm'}
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}
