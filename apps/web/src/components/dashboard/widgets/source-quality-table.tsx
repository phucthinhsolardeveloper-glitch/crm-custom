'use client';

import { type SourceQualityItem, fmtNum, fmtPct, fmtVNDShort } from '../constants';
import { InfoTooltip } from './info-tooltip';

/**
 * Ngưỡng đánh giá nguồn (heuristic - chỉnh theo feedback giám đốc).
 * CV%: >= GOOD là camp tốt, DECENT-GOOD đạt chuẩn, LOW-DECENT dưới chuẩn, < LOW cần xem lại.
 * HIGH_RPO_MULT: DT/đơn >= x lần trung bình bảng = "đơn to".
 */
const RATING_THRESHOLDS = {
  CV_GOOD: 6,
  CV_DECENT: 3,
  CV_LOW: 1.5,
  HIGH_RPO_MULT: 2,
} as const;

interface Rating {
  label: string;
  cls: string;
}

/** Pill đánh giá tính ở FE từ cvRate + DT/đơn so với trung bình bảng. */
function rateSource(item: SourceQualityItem, avgRevenuePerOrder: number): Rating {
  // Nguồn không có lead mới trong kỳ nhưng có tiền verify (lead tạo trước kỳ)
  // -> không chấm điểm camp, gắn nhãn trung tính.
  if (item.leads === 0) return { label: 'LEAD TRƯỚC KỲ', cls: 'bg-slate-100 text-slate-500' };
  const { CV_GOOD, CV_DECENT, CV_LOW, HIGH_RPO_MULT } = RATING_THRESHOLDS;
  const bigOrder = avgRevenuePerOrder > 0 && item.revenuePerOrder >= HIGH_RPO_MULT * avgRevenuePerOrder;

  if (item.cvRate >= CV_GOOD && bigOrder) return { label: 'CV + ĐƠN ĐỀU TỐT', cls: 'bg-emerald-100 text-emerald-700' };
  if (item.cvRate >= CV_GOOD) return { label: 'CAMP TỐT NHẤT', cls: 'bg-emerald-50 text-emerald-600' };
  if (item.cvRate < CV_DECENT && bigOrder) return { label: 'CV THẤP, ĐƠN TO', cls: 'bg-violet-50 text-violet-600' };
  if (item.cvRate >= CV_DECENT) return { label: 'ĐẠT CHUẨN', cls: 'bg-sky-50 text-sky-600' };
  if (item.cvRate >= CV_LOW) return { label: 'DƯỚI CHUẨN', cls: 'bg-amber-50 text-amber-600' };
  return { label: 'XEM LẠI CAMP', cls: 'bg-red-50 text-red-600' };
}

/** Bar CV% - max scale 10% (CV lead hiếm khi vượt) để bar có độ phân giải. */
function CvBar({ rate }: { rate: number }) {
  const width = Math.min(100, (rate / 10) * 100);
  const color = rate >= RATING_THRESHOLDS.CV_GOOD ? '#10b981' : rate >= RATING_THRESHOLDS.CV_DECENT ? '#0ea5e9' : rate >= RATING_THRESHOLDS.CV_LOW ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 shrink-0 rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{fmtPct(rate)}</span>
    </div>
  );
}

function RatingPill({ rating }: { rating: Rating }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${rating.cls}`}>
      {rating.label}
    </span>
  );
}

interface SourceQualityTableProps {
  items: SourceQualityItem[];
  loading: boolean;
}

/**
 * Bảng "Nguồn lead": lead / % khách cũ / CV% / DT / DT-đơn / đánh giá.
 * Desktop: table đầy đủ. Mobile (< md): card view mỗi nguồn 1 card.
 * Dòng "Không gắn nguồn" (leads=0, chỉ có DT) style cảnh báo đỏ.
 */
export function SourceQualityTable({ items, loading }: SourceQualityTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  const withLeads = items.filter(i => i.leads > 0);
  const avgRpo = withLeads.length > 0
    ? withLeads.reduce((s, i) => s + i.revenuePerOrder, 0) / withLeads.length
    : 0;
  const isWarnRow = (i: SourceQualityItem) => i.source === 'Không gắn nguồn';

  // Hiển thị theo tỉ lệ chuyển đổi giảm dần (tie-break: lead nhiều hơn đứng trước).
  // Các dòng đặc biệt (Khác, leads=0, Không gắn nguồn) dồn xuống cuối.
  const sorted = [...items].sort((a, b) => {
    const specialA = a.leads === 0 || a.source === 'Khác' ? 1 : 0;
    const specialB = b.leads === 0 || b.source === 'Khác' ? 1 : 0;
    if (specialA !== specialB) return specialA - specialB;
    if (b.cvRate !== a.cvRate) return b.cvRate - a.cvRate;
    return b.leads - a.leads;
  });

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <div className="flex items-center gap-1.5 px-5 pt-4">
        <h3 className="text-sm font-bold text-slate-900">Nguồn lead</h3>
        <InfoTooltip text="Lead + CV% theo lead tạo trong kỳ; doanh thu = payment đã verify trong kỳ, gắn nguồn qua lead của đơn." />
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">Chưa có nguồn lead trong kỳ</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto px-2 pb-3 pt-2 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Nguồn</th>
                  <th className="px-3 py-2 text-right">Lead</th>
                  <th className="px-3 py-2 text-right">% khách cũ</th>
                  <th className="px-3 py-2 text-left">Tỷ lệ chuyển đổi</th>
                  <th className="px-3 py-2 text-right">DT từ nguồn</th>
                  <th className="px-3 py-2 text-left">Đánh giá</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(item => {
                  const warn = isWarnRow(item);
                  const noLeads = item.leads === 0; // dòng chỉ có DT (lead trước kỳ / không gắn lead)
                  return (
                    <tr key={`${item.sourceId ?? item.source}`} className={`border-b border-slate-50 transition-colors hover:bg-sky-50/30 ${warn ? 'bg-red-50/40' : ''}`}>
                      <td className={`px-3 py-2.5 font-semibold ${warn ? 'text-red-600' : 'text-slate-800'}`}>{item.source}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{noLeads ? '--' : fmtNum(item.leads)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{noLeads ? '--' : fmtPct(item.returningPct)}</td>
                      <td className="px-3 py-2.5">{noLeads ? <span className="text-xs text-slate-400">--</span> : <CvBar rate={item.cvRate} />}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{fmtVNDShort(item.revenue)}</td>
                      <td className="px-3 py-2.5">
                        {warn
                          ? <span className="inline-flex whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">ĐƠN KHÔNG GẮN LEAD</span>
                          : <RatingPill rating={rateSource(item, avgRpo)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: card view */}
          <div className="space-y-3 px-4 pb-4 pt-2 md:hidden">
            {sorted.map(item => {
              const warn = isWarnRow(item);
              const noLeads = item.leads === 0;
              return (
                <div key={`m-${item.sourceId ?? item.source}`} className={`rounded-lg border p-3 ${warn ? 'border-red-100 bg-red-50/40' : 'border-slate-100'}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${warn ? 'text-red-600' : 'text-slate-800'}`}>{item.source}</span>
                    {warn
                      ? <span className="inline-flex whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">ĐƠN KHÔNG GẮN LEAD</span>
                      : <RatingPill rating={rateSource(item, avgRpo)} />}
                  </div>
                  {!noLeads && (
                    <div className="mb-2"><CvBar rate={item.cvRate} /></div>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>Lead: <b className="tabular-nums">{noLeads ? '--' : fmtNum(item.leads)}</b></span>
                    <span>% khách cũ: <b className="tabular-nums">{noLeads ? '--' : fmtPct(item.returningPct)}</b></span>
                    <span>DT: <b className="tabular-nums text-slate-900">{fmtVNDShort(item.revenue)}</b></span>
                    <span>Đơn: <b className="tabular-nums">{fmtNum(item.orderCount)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
