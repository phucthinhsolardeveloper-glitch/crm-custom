'use client';

import { cn, formatCompactMoney } from '@/lib/utils';
import type { DonutDatum } from './payment-donut-chart';
import { getKey } from './payment-donut-chart';

interface Props {
  data: DonutDatum[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}

export function PaymentDonutLegend({ data, activeKey, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-1.5 mt-3">
      {data.map((d) => {
        const key = getKey(d);
        const isActive = activeKey === key;
        return (
          <button
            key={key}
            type="button"
            onMouseEnter={() => onSelect(key)}
            onMouseLeave={() => onSelect(null)}
            onFocus={() => onSelect(key)}
            onBlur={() => onSelect(null)}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border transition-all text-left w-full',
              isActive
                ? 'bg-white border-sky-300 shadow-sm'
                : 'border-transparent hover:bg-white hover:border-slate-200',
            )}
          >
            <span
              className="w-3.5 h-3.5 rounded shrink-0"
              style={{ backgroundColor: d.color }}
              aria-hidden
            />
            <span className="flex-1 text-xs font-semibold text-slate-700 truncate" title={d.name}>
              {d.name}
            </span>
            <span className="text-xs font-bold text-slate-900 shrink-0">
              {formatCompactMoney(d.revenue)}
            </span>
            <span className="text-[10px] text-slate-500 min-w-[34px] text-right shrink-0">
              {d.percent.toFixed(1)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
