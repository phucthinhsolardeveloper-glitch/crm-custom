'use client';

/**
 * Danh sach cuoc goi - permission: MANAGER + SUPER_ADMIN.
 * Focal point: avatar + ten sale phu trach (thay vi trang thai ghep).
 * Filter: date range, sale (drill-down), call type, quick filters, search SĐT.
 */
import { useState, useEffect, useTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Sparkles, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import type { CallLogRecord, SaleSummary } from '@/types/entities';
import { CallLogRow } from './call-log-row';
import { CallLogExpanded } from './call-log-expanded';

interface CallLogListClientProps {
  callLogs: CallLogRecord[];
  meta?: { total?: number; page?: number; limit?: number; totalPages?: number };
  sales: SaleSummary[];
}

export function CallLogListClient({ callLogs: initialLogs, meta, sales }: CallLogListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // USER chi thay cuoc cua minh -> khong can dropdown loc theo sale / nut tom tat toan team.
  const isUser = user?.role === 'USER';

  const [callLogs, setCallLogs] = useState<CallLogRecord[]>(initialLogs);
  // Deep-link tu notification feedback (?callId=) -> tu mo rong dung cuoc goi do.
  const [expandedId, setExpandedId] = useState<string | null>(searchParams.get('callId'));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter form state (mirrors URL params for controlled inputs)
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') ?? '');
  const [userId, setUserId] = useState(searchParams.get('userId') ?? '');
  const [callType, setCallType] = useState(searchParams.get('callType') ?? '');
  const [minScore, setMinScore] = useState(searchParams.get('minScore') ?? '');
  const [maxScore, setMaxScore] = useState(searchParams.get('maxScore') ?? '');
  const [hasAi, setHasAi] = useState(searchParams.get('hasAi') === 'true');

  // Filter bar collapse - mac dinh dong, tu mo neu URL co filter (user vua reload trang voi state cu)
  const [filtersOpen, setFiltersOpen] = useState(
    !!(searchParams.get('dateFrom') || searchParams.get('dateTo') || searchParams.get('userId') ||
       searchParams.get('callType') || searchParams.get('minScore') || searchParams.get('maxScore') ||
       searchParams.get('hasAi') === 'true')
  );

  // Score range numeric (0-10). Empty URL -> 0/10 (no filter).
  const minVal = Math.max(0, Math.min(10, parseInt(minScore) || 0));
  const maxVal = Math.max(0, Math.min(10, parseInt(maxScore) || 10));

  // AI summary state
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLabel, setSummaryLabel] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [quickAnalyzing, setQuickAnalyzing] = useState(false);

  useEffect(() => { setCallLogs(initialLogs); }, [initialLogs]);

  const hasFilter = !!(dateFrom || dateTo || userId || callType || minScore || maxScore || hasAi);
  const activeFilterCount = [dateFrom, dateTo, userId, callType, minScore, maxScore, hasAi ? 'x' : ''].filter(Boolean).length;
  const selectedSale = useMemo(() => sales.find((s) => s.id === userId), [sales, userId]);

  function pushFilters(updates: Record<string, string | undefined>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k);
    });
    p.delete('page');
    p.delete('cursor');
    setSummary(null);
    startTransition(() => router.push(`?${p.toString()}`));
  }

  function applyFilter() {
    pushFilters({ dateFrom, dateTo, userId, callType, minScore, maxScore, hasAi: hasAi ? 'true' : '' });
  }

  function clearFilter() {
    setDateFrom(''); setDateTo(''); setUserId(''); setCallType('');
    setMinScore(''); setMaxScore(''); setHasAi(false);
    pushFilters({ dateFrom: '', dateTo: '', userId: '', callType: '', minScore: '', maxScore: '', hasAi: '' });
  }

  function toggleHasAi() {
    const next = !hasAi;
    setHasAi(next);
    pushFilters({ hasAi: next ? 'true' : '' });
  }

  function handleUserDrillDown(targetUserId: string) {
    setUserId(targetUserId);
    pushFilters({ userId: targetUserId });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/call-logs/${id}`);
      setCallLogs((prev) => prev.filter((c) => c.id !== id));
      toast.success('Đã xoá cuộc gọi');
      if (expandedId === id) setExpandedId(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xoá cuộc gọi');
    } finally {
      setDeletingId(null);
    }
  }

  // Goi AI tom tat cho 1 khoang ngay, dung chung cho nut "Tom tat" va "Phan tich nhanh".
  async function runSummarize(from: string, to: string, label: string, setBusy: (v: boolean) => void) {
    setBusy(true);
    try {
      const res = await api.post<{ data: string }>('/call-logs/summarize', { dateFrom: from, dateTo: to });
      setSummary(res.data);
      setSummaryLabel(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tóm tắt');
    } finally {
      setBusy(false);
    }
  }

  function handleSummarize() {
    if (!dateFrom || !dateTo) { toast.error('Chọn khoảng ngày trước'); return; }
    runSummarize(dateFrom, dateTo, `${dateFrom} → ${dateTo}`, setSummarizing);
  }

  // Phan tich nhanh: tu dong lay ca ngay hom nay, khong can chon gi.
  function handleQuickAnalyze() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const from = `${y}-${m}-${d}T00:00`;
    const to = `${y}-${m}-${d}T23:59`;
    runSummarize(from, to, `Hôm nay (${d}/${m}/${y})`, setQuickAnalyzing);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          <span className="bg-gradient-to-r from-sky-500 to-cyan-500 bg-clip-text text-transparent">Lịch sử cuộc gọi</span>
        </h1>
        
      </div>

      {/* Filter bar - collapsible, mac dinh dong */}
      <div className="rounded-2xl bg-white border border-slate-200 mb-5 shadow-sm overflow-hidden">
        {/* Header (luon hien thi) */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-sky-600 transition"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-sky-500 text-white px-2 py-0.5 text-[10px] font-bold leading-none">{activeFilterCount}</span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Active filter chips when collapsed */}
          {!filtersOpen && activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center text-[11px]">
              {dateFrom && <span className="rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5">Từ {dateFrom.slice(5, 10)}</span>}
              {dateTo && <span className="rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5">Đến {dateTo.slice(5, 10)}</span>}
              {selectedSale && <span className="rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5">👤 {selectedSale.name}</span>}
              {callType && <span className="rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5">{callType === 'OUTGOING' ? 'Gọi đi' : callType === 'INCOMING' ? 'Gọi đến' : 'Nhỡ'}</span>}
              {(minScore || maxScore) && <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5">⭐ {minVal}-{maxVal}</span>}
              {hasAi && <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5">✨ Có AI</span>}
            </div>
          )}

          {hasFilter && (
            <Button size="sm" variant="ghost" onClick={clearFilter} className="text-slate-400 h-7">
              <X className="h-3 w-3 mr-1" />Xóa
            </Button>
          )}

          {!isUser && (
            <Button size="sm" onClick={handleQuickAnalyze} disabled={quickAnalyzing || summarizing} className="ml-auto bg-gradient-to-r from-sky-500 to-cyan-500 hover:opacity-90">
              {quickAnalyzing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Phân tích AI hôm nay
            </Button>
          )}

          {hasFilter && !isUser && (
            <Button size="sm" onClick={handleSummarize} disabled={summarizing || quickAnalyzing} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90">
              {summarizing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Tóm tắt AI
            </Button>
          )}
        </div>

        {/* Body (collapse) */}
        {filtersOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-3">
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Từ lúc</label>
                <Input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} step={60} />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Đến lúc</label>
                <Input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} step={60} />
              </div>
              {!isUser && (
                <div className="md:col-span-3">
                  <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Sale phụ trách</label>
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none h-9"
                  >
                    <option value="">Tất cả nhân viên</option>
                    {sales.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.count})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Loại</label>
                <select
                  value={callType}
                  onChange={(e) => setCallType(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none h-9"
                >
                  <option value="">Tất cả loại</option>
                  <option value="OUTGOING">Gọi đi</option>
                  <option value="INCOMING">Gọi đến</option>
                  <option value="MISSED">Nhỡ</option>
                </select>
              </div>
              <div className="md:col-span-1 flex">
                <Button onClick={applyFilter} disabled={isPending} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lọc'}
                </Button>
              </div>
            </div>

            {/* Row 2: dual-thumb score slider + hasAi chip */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
              <div className="md:col-span-6">
                <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1 flex items-center justify-between">
                  <span>Điểm AI</span>
                  <span className="text-sky-600 font-bold normal-case">{minVal} - {maxVal}</span>
                </label>
                <div className="relative h-6 flex items-center px-2">
                  {/* Track + fill */}
                  <div className="absolute left-2 right-2 h-1.5 bg-slate-200 rounded-full" />
                  <div
                    className="absolute h-1.5 bg-gradient-to-r from-sky-400 to-cyan-500 rounded-full"
                    style={{ left: `calc(${minVal * 10}% * (100% - 16px) / 100% + 8px)`, right: `calc(${(10 - maxVal) * 10}% * (100% - 16px) / 100% + 8px)` }}
                  />
                  {/* 2 overlapping inputs (thang 0-10) */}
                  <input
                    type="range" min={0} max={10} step={1} value={minVal}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(parseInt(e.target.value, 10), maxVal - 1));
                      setMinScore(v === 0 ? '' : String(v));
                    }}
                    className="range-dual absolute inset-0"
                    aria-label="Điểm tối thiểu"
                  />
                  <input
                    type="range" min={0} max={10} step={1} value={maxVal}
                    onChange={(e) => {
                      const v = Math.min(10, Math.max(parseInt(e.target.value, 10), minVal + 1));
                      setMaxScore(v === 10 ? '' : String(v));
                    }}
                    className="range-dual absolute inset-0"
                    aria-label="Điểm tối đa"
                  />
                </div>
              </div>
              <div className="md:col-span-6 flex items-end justify-end">
                <button
                  onClick={toggleHasAi}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                    hasAi
                      ? 'bg-purple-500 text-white border-purple-500 hover:bg-purple-600'
                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  ✨ Chỉ cuộc có AI
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI summary panel */}
      {summary && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-purple-900 flex items-center gap-2"><Sparkles className="h-4 w-4" />Tóm tắt AI ({summaryLabel})</h3>
            <Button size="sm" variant="ghost" onClick={() => setSummary(null)} className="text-purple-400 h-7"><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="prose prose-sm prose-purple max-w-none text-sm text-purple-900 [&_strong]:text-purple-950 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Call list */}
      {callLogs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">Không có cuộc gọi nào</div>
      ) : (
        <div className="space-y-2">
          {callLogs.map((log) => (
            <div key={log.id}>
              <CallLogRow
                log={log}
                isExpanded={expandedId === log.id}
                onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                onUserClick={handleUserDrillDown}
              />
              {expandedId === log.id && (
                <CallLogExpanded
                  log={log}
                  canDelete={isSuperAdmin}
                  isDeleting={deletingId === log.id}
                  onDelete={() => handleDelete(log.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
