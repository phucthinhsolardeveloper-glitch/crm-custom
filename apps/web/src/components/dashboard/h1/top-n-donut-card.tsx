'use client';

import { useState } from 'react';
import type { TopNResponse } from '@crm/types';
import { ChartCard } from '../widgets/chart-card';
import { fmtVNDShort } from '../constants';

const PALETTE = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#94a3b8'];

interface TopNDonutCardProps {
  title: string;
  icon?: string;
  data: TopNResponse | null;
  loading: boolean;
  /** Tag hiển thị data quality (vd: "Random fill", "Real"). */
  qualityTag?: { label: string; color: 'green' | 'amber' };
  /** Text giải thích nguồn số liệu - icon (i) cạnh title. */
  infoTooltip?: string;
}

export function TopNDonutCard({ title, icon, data, loading, qualityTag, infoTooltip }: TopNDonutCardProps) {
  const [showOther, setShowOther] = useState(false);

  if (loading) {
    return (
      <ChartCard title={`${icon ?? ''} ${title}`.trim()} infoTooltip={infoTooltip}>
        <div className="h-[240px] animate-pulse rounded-lg bg-slate-100" />
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

  let offset = 25;
  const segments = data.items.map((item, idx) => {
    const seg = { color: PALETTE[idx % PALETTE.length], pct: item.pct, offset };
    offset -= item.pct;
    return seg;
  });

  return (
    <ChartCard title={`${icon ?? ''} ${title}`.trim()} infoTooltip={infoTooltip}>
      {qualityTag && (
        <span
          className={`absolute -mt-9 ml-auto right-5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            qualityTag.color === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {qualityTag.label}
        </span>
      )}
      <div className="flex justify-center mb-3">
        <svg width="120" height="120" viewBox="0 0 42 42" className="-rotate-90">
          {/* pathLength=100 chuẩn hoá chu vi -> pct map 1:1. Gap = 100-pct để 100% tô kín vòng. */}
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="6" pathLength={100} />
          {segments.map((seg, idx) => (
            <circle
              key={idx}
              cx="21"
              cy="21"
              r="15.9"
              fill="none"
              stroke={seg.color}
              strokeWidth="6"
              pathLength={100}
              strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
              strokeDashoffset={seg.offset}
            />
          ))}
        </svg>
      </div>

      <div className="space-y-1 text-xs">
        {data.items.map((item, idx) => {
          const isOther = item.id === null && item.name === 'Khác';
          return (
            <div key={`${item.id ?? 'other'}-${idx}`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[idx % PALETTE.length] }} />
                <span className="flex-1 truncate" title={item.name}>
                  {item.name}
                  {isOther && data.other && (
                    <span className="text-slate-400 ml-1">({data.other.count} loại)</span>
                  )}
                </span>
                <span className="font-bold tabular-nums">{item.pct.toFixed(1)}%</span>
              </div>
              <div className="text-[10px] text-slate-400 ml-4">
                {fmtVNDShort(item.revenue)} {item.orderCount ? `· ${item.orderCount} đơn` : ''}
              </div>
            </div>
          );
        })}
      </div>

      {data.other && (
        <details
          className="mt-2 pt-2 border-t border-slate-100"
          open={showOther}
          onToggle={(e) => setShowOther((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-[11px] text-sky-600 hover:underline">
            ▸ Xem {data.other.count} loại "Khác"
          </summary>
          <div className="mt-1 text-[10px] text-slate-500">
            Click để xem drill-down (lazy load chưa implement - placeholder)
          </div>
        </details>
      )}
    </ChartCard>
  );
}
