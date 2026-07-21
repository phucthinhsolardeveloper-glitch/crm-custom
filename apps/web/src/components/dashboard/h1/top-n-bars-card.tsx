'use client';

import type { TopNResponse } from '@crm/types';
import { ChartCard } from '../widgets/chart-card';
import { fmtVNDShort } from '../constants';

const PALETTE = ['#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#f43f5e', '#94a3b8'];

interface TopNBarsCardProps {
  title: string;
  icon?: string;
  data: TopNResponse | null;
  loading: boolean;
  /** Text giải thích nguồn số liệu - icon (i) cạnh title. */
  infoTooltip?: string;
  /** Item có name nằm trong list này được style cảnh báo đỏ (vd "Chưa gắn danh mục"). */
  highlightNames?: string[];
}

export function TopNBarsCard({ title, icon, data, loading, infoTooltip, highlightNames }: TopNBarsCardProps) {
  if (loading) {
    return (
      <ChartCard title={`${icon ?? ''} ${title}`.trim()} infoTooltip={infoTooltip}>
        <div className="h-[200px] animate-pulse rounded-lg bg-slate-100" />
      </ChartCard>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <ChartCard title={`${icon ?? ''} ${title}`.trim()} infoTooltip={infoTooltip}>
        <p className="py-10 text-center text-xs text-slate-400">Chưa có dữ liệu</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={`${icon ?? ''} ${title}`.trim()} infoTooltip={infoTooltip}>
      <div className="text-2xl font-bold tabular-nums text-slate-900 mb-1">{fmtVNDShort(data.total)}</div>
      <div className="text-[11px] text-slate-500 mb-3">
        {data.totalGroups} loại {data.other ? `· Top 5 + Khác` : ''}
      </div>
      <div className="space-y-2.5">
        {data.items.map((item, idx) => {
          const isOther = item.id === null && item.name === 'Khác';
          const isWarn = highlightNames?.includes(item.name) ?? false;
          return (
            <div key={`${item.id ?? 'other'}-${idx}`}>
              <div className="flex justify-between mb-1 text-xs">
                <span className={`font-medium truncate ${isWarn ? 'text-red-600' : ''}`} title={item.name}>
                  {item.name}
                  {isOther && data.other && (
                    <span className="text-slate-400 ml-1">({data.other.count})</span>
                  )}
                </span>
                <span className={`font-bold tabular-nums shrink-0 ${isWarn ? 'text-red-600' : ''}`}>{item.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ background: isWarn ? '#ef4444' : PALETTE[idx % PALETTE.length], width: `${item.pct}%` }}
                />
              </div>
              <div className={`text-[10px] mt-0.5 ${isWarn ? 'text-red-400' : 'text-slate-400'}`}>
                {fmtVNDShort(item.revenue)} {item.orderCount ? `· ${item.orderCount} đơn` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
