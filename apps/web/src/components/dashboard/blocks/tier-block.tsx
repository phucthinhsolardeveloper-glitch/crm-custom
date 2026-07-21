'use client';

import { type TierDistributionItem, type TierMovementData, fmtNum, fmtVNDShort } from '../constants';
import { BlockSectionLabel } from './block-section-label';
import { ChartCard } from '../widgets/chart-card';
import { ArrowRight } from 'lucide-react';

/** Màu fallback khi tier không có color trong DB (vd dòng "Chưa xếp hạng"). */
const FALLBACK_COLOR = '#94a3b8';

interface TierBlockProps {
  distribution: TierDistributionItem[];
  movement: TierMovementData | null;
  loading: boolean;
}

/** Card trái: mỗi hạng 1 dòng (emoji, tên, bar số KH, tổng chi tiêu, TB/KH) + stacked tỉ trọng tiền. */
function TierDistributionCard({ items, loading }: { items: TierDistributionItem[]; loading: boolean }) {
  if (loading) {
    return (
      <ChartCard title="💎 Số khách + chi tiêu theo hạng">
        <div className="h-[240px] animate-pulse rounded-lg bg-slate-100" />
      </ChartCard>
    );
  }
  if (items.length === 0) {
    return (
      <ChartCard title="💎 Số khách + chi tiêu theo hạng">
        <p className="py-10 text-center text-xs text-slate-400">Chưa có dữ liệu hạng khách</p>
      </ChartCard>
    );
  }

  const maxCount = Math.max(...items.map(i => i.customerCount), 1);
  const totalSpend = items.reduce((s, i) => s + i.totalSpend, 0);

  return (
    <ChartCard
      title="💎 Số khách + chi tiêu theo hạng"
      infoTooltip="Toàn bộ khách hiện tại theo hạng (không theo kỳ lọc). Chi tiêu = tổng payment đã verify từ trước đến nay."
    >
      <div className="space-y-2.5">
        {items.map(t => {
          const color = t.color ?? FALLBACK_COLOR;
          return (
            <div key={t.tierId ?? 'no-tier'} className="grid grid-cols-[minmax(90px,1.2fr)_2fr_auto] items-center gap-3">
              <span className="truncate text-xs font-semibold text-slate-700">
                {t.emoji ? `${t.emoji} ` : ''}{t.name}
              </span>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max((t.customerCount / maxCount) * 100, t.customerCount > 0 ? 3 : 0)}%`, background: color }}
                />
              </div>
              <div className="text-right text-[11px] leading-4 text-slate-500">
                <div className="font-bold tabular-nums text-slate-800">{fmtNum(t.customerCount)} KH</div>
                <div className="tabular-nums">{fmtVNDShort(t.totalSpend)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {totalSpend > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Tỉ trọng tiền theo hạng
          </div>
          <div className="flex h-3 overflow-hidden rounded-full">
            {items.filter(t => t.totalSpend > 0).map(t => (
              <div
                key={`share-${t.tierId ?? 'no-tier'}`}
                title={`${t.name}: ${fmtVNDShort(t.totalSpend)} (${Math.round((t.totalSpend / totalSpend) * 100)}%)`}
                style={{ width: `${(t.totalSpend / totalSpend) * 100}%`, background: t.color ?? FALLBACK_COLOR }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {items.filter(t => t.totalSpend > 0).map(t => (
              <span key={`lg-${t.tierId ?? 'no-tier'}`} className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color ?? FALLBACK_COLOR }} />
                {t.name} {Math.round((t.totalSpend / totalSpend) * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

/** Card phải: dịch chuyển hạng trong kỳ (from -> to + count). */
function TierMovementCard({ movement, loading }: { movement: TierMovementData | null; loading: boolean }) {
  if (loading) {
    return (
      <ChartCard title="🔁 Dịch chuyển hạng trong kỳ">
        <div className="h-[240px] animate-pulse rounded-lg bg-slate-100" />
      </ChartCard>
    );
  }

  const items = movement?.items ?? [];
  return (
    <ChartCard
      title="🔁 Dịch chuyển hạng trong kỳ"
      infoTooltip="Số lượt khách đổi hạng trong kỳ lọc (lên hoặc xuống), ghi nhận tự động khi tiền verify thay đổi tổng chi tiêu."
    >
      {items.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-400">Chưa có dữ liệu dịch chuyển trong kỳ</p>
      ) : (
        <>
          <div className="mb-3 text-2xl font-bold tabular-nums text-slate-900">
            {fmtNum(movement!.total)} <span className="text-xs font-medium text-slate-400">lượt đổi hạng</span>
          </div>
          <div className="space-y-2">
            {items.map(m => (
              <div key={`${m.fromTierId ?? 'none'}-${m.toTierId ?? 'none'}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-700">
                  {m.from}
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                  {m.to}
                </span>
                <span className="font-bold tabular-nums text-slate-900">{fmtNum(m.count)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

/** Block 4 - Hạng khách: phân bố KH/chi tiêu theo hạng + dịch chuyển hạng trong kỳ. */
export function TierBlock({ distribution, movement, loading }: TierBlockProps) {
  return (
    <section className="space-y-3">
      <BlockSectionLabel index={4} title="Hạng khách" question="Tiền nằm ở nhóm khách nào, ai vừa lên hạng?" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TierDistributionCard items={distribution} loading={loading} />
        </div>
        <TierMovementCard movement={movement} loading={loading} />
      </div>
    </section>
  );
}
