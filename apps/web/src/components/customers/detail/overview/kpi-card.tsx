import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string;
  delta?: string;
  /** Đánh dấu màu cảnh báo (vd lastContact > 7 ngày). */
  warn?: boolean;
  /** Hex color override - nếu có thì background gradient theo tone (vd theo tier color). */
  tone?: string | null;
}

export function KpiCard({ label, value, delta, warn, tone }: Props) {
  const hasTone = !!tone && !warn;
  const style = hasTone
    ? { background: `linear-gradient(135deg, ${tone}15 0%, ${tone}30 100%)`, borderColor: `${tone}40` }
    : undefined;

  return (
    <div
      className={cn(
        'rounded-2xl border p-3.5 shadow-sm transition-shadow hover:shadow-md',
        hasTone ? '' : 'bg-white',
        warn ? 'border-amber-300' : !hasTone ? 'border-slate-200' : '',
      )}
      style={style}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-xl font-extrabold',
          warn ? 'text-amber-700' : 'text-slate-900',
        )}
        style={hasTone ? { color: tone! } : undefined}
      >
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            'mt-0.5 text-[11px] font-semibold',
            warn ? 'text-amber-600' : !hasTone ? 'text-emerald-600' : '',
          )}
          style={hasTone ? { color: tone! } : undefined}
        >
          {delta}
        </div>
      )}
    </div>
  );
}
