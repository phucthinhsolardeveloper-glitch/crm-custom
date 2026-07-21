'use client';

import { fmtNum } from '../constants';

interface ChartTooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
  valueFormatter?: (v: number) => string;
}

export function ChartTooltip({ active, payload, label, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm px-3 py-2 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.12)]">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name}: {valueFormatter ? valueFormatter(p.value) : fmtNum(p.value)}
        </p>
      ))}
    </div>
  );
}
