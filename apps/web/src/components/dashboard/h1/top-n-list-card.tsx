'use client';

import type { TopNResponse } from '@crm/types';
import { ChartCard } from '../widgets/chart-card';
import { fmtVNDShort } from '../constants';

interface TopNListCardProps {
  title: string;
  icon?: string;
  data: TopNResponse | null;
  loading: boolean;
  /** Custom icon resolver per item (vd: bank acronym → color). */
  itemIcon?: (name: string, idx: number) => { label: string; color: string };
  /** Text giải thích nguồn số liệu - icon (i) cạnh title. */
  infoTooltip?: string;
  /** Item có name nằm trong list này được style cảnh báo đỏ (vd "Không qua bank"). */
  highlightNames?: string[];
}

// 2 ký tự đầu tiên + màu hash từ tên - dùng làm fallback icon nếu không có itemIcon.
function defaultIcon(name: string, idx: number) {
  const colors = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207', '#7e22ce', '#0e7490', '#be185d', '#475569'];
  const label = name.slice(0, 3).toUpperCase().replace(/\s/g, '');
  return { label, color: colors[idx % colors.length] };
}

export function TopNListCard({ title, icon, data, loading, itemIcon, infoTooltip, highlightNames }: TopNListCardProps) {
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
      <div className="space-y-2">
        {data.items.map((item, idx) => {
          const isOther = item.id === null && item.name === 'Khác';
          const isWarn = highlightNames?.includes(item.name) ?? false;
          const ic = itemIcon ? itemIcon(item.name, idx) : defaultIcon(item.name, idx);
          return (
            <div
              key={`${item.id ?? 'other'}-${idx}`}
              className={`flex items-center gap-2 p-2 rounded-lg ${isWarn ? 'bg-red-50/70' : isOther ? 'bg-amber-50/60' : 'bg-slate-50'}`}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-white text-[10px] shrink-0"
                style={{ background: isWarn ? '#ef4444' : ic.color }}
              >
                {ic.label}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold truncate ${isWarn ? 'text-red-600' : ''}`} title={item.name}>
                  {item.name}
                  {isOther && data.other && (
                    <span className="text-slate-400 ml-1 font-normal">({data.other.count} loại)</span>
                  )}
                </div>
                <div className={`text-[10px] ${isWarn ? 'text-red-400' : 'text-slate-500'}`}>
                  {fmtVNDShort(item.revenue)} · {item.pct.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
