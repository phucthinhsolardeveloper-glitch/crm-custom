'use client';

import { fmtNum } from '../constants';
import { InfoTooltip } from './info-tooltip';

/** Mini stacked bar inline trong KPI card - hover hiện tooltip multiline */
export interface KpiMiniBar {
  /** % của segment đầu (0-100). Segment 2 tự tính = 100 - ratio. */
  ratio: number;
  /** Mỗi dòng 1 phần tử - render xuống dòng trong tooltip. */
  tooltipLines: string[];
}

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  accentColor: string;
  bgColor: string;
  /** Previous period value - if provided, show trend arrow + % change */
  previousValue?: number | null;
  /** Current raw number - needed for trend calculation */
  currentValue?: number | null;
  /** Variant: 'default' = white bg, 'gradient' = grad-sky bg + white text (highlight KPI) */
  variant?: 'default' | 'gradient';
  /** Cho phép override format delta. 'pct' = "+18%", 'pp' = "+2.4pp" (percentage points) */
  deltaFormat?: 'pct' | 'pp';
  /** Icon JSX hiển thị góc phải. Khi gradient variant, icon trên nền trắng/20. */
  icon?: React.ReactNode;
  /** Mini-bar đơn sắc hover-tooltip, hiển thị tỉ lệ KH mới vs KH cũ */
  miniBar?: KpiMiniBar;
  /** Text giải thích chỉ số - render icon (i) cạnh title, hover/tap hiện tooltip */
  infoTooltip?: string;
}

/** Calculate % change and direction; null khi không đủ data */
function getTrend(current?: number | null, previous?: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return { pct, direction: pct >= 0 ? 'up' : 'down' } as const;
}

/** Delta theo pp (percentage points) - dùng cho metric vốn đã là %. */
function getDeltaPp(current?: number | null, previous?: number | null) {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  return { pp: diff, direction: diff >= 0 ? 'up' : 'down' } as const;
}

export function KpiCard({
  title, value, subtitle, accentColor, bgColor,
  previousValue, currentValue,
  variant = 'default',
  deltaFormat = 'pct',
  icon,
  miniBar,
  infoTooltip,
}: KpiCardProps) {
  const trend = deltaFormat === 'pp'
    ? getDeltaPp(currentValue, previousValue)
    : getTrend(currentValue, previousValue);
  const isGradient = variant === 'gradient';

  // Gradient variant: sky -> cyan, text trắng, shadow primary.
  // flex flex-col + h-full để tất cả card trong grid cao bằng nhau, mini-bar tự đẩy xuống đáy.
  // KHÔNG overflow-hidden ở container - sẽ cắt mất tooltip (i); accent circle có layer clip riêng.
  const containerCls = isGradient
    ? 'relative flex h-full flex-col rounded-xl p-4 text-white shadow-[0_8px_20px_-10px_rgba(14,165,233,0.55)]'
    : 'card-hover relative flex h-full flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]';

  const containerStyle = isGradient
    ? { background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)' }
    : undefined;

  const titleCls = isGradient
    ? 'text-xs font-semibold uppercase tracking-wide opacity-90'
    : 'text-xs font-semibold uppercase tracking-wide text-slate-500';

  const valueCls = isGradient
    ? 'mt-1.5 text-2xl font-bold tabular-nums'
    : 'mt-1.5 text-2xl font-bold tabular-nums';

  const valueStyle = isGradient ? undefined : { color: accentColor };

  return (
    <div className={containerCls} style={containerStyle}>
      {/* Accent circle background - only default variant. Layer clip riêng thay cho overflow-hidden container. */}
      {!isGradient && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-10" style={{ backgroundColor: accentColor }} />
          {/* Thanh accent đáy card - nằm trong layer clip để bo theo góc card */}
          <div className="absolute bottom-0 left-0 h-0.5 w-full" style={{ background: `linear-gradient(to right, ${accentColor}, ${bgColor})` }} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1">
          <span className={titleCls}>{title}</span>
          {infoTooltip && <InfoTooltip text={infoTooltip} onGradient={isGradient} side="bottom" />}
        </span>
        {icon && (
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${isGradient ? 'bg-white/20' : ''}`}
               style={!isGradient ? { backgroundColor: bgColor } : undefined}>
            {icon}
          </div>
        )}
        {!icon && trend && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            isGradient
              ? 'bg-white/20 text-white'
              : trend.direction === 'up'
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-500'
          }`}>
            {trend.direction === 'up' ? '↑' : '↓'}
            {'pct' in trend ? `${Math.abs(Math.round(trend.pct))}%` : `${Math.abs(trend.pp).toFixed(1)}pp`}
          </span>
        )}
      </div>

      <p className={valueCls} style={valueStyle}>{value}</p>

      <div className="mt-0.5 flex items-center justify-between">
        {subtitle && (
          <p className={`text-[11px] ${isGradient ? 'opacity-80' : 'text-slate-400'}`}>{subtitle}</p>
        )}
        {trend && (
          <p className={`flex items-center gap-1 text-[11px] ${isGradient ? 'opacity-90' : ''}`}>
            <span className={`font-semibold ${
              isGradient ? '' : trend.direction === 'up' ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {trend.direction === 'up' ? '+' : ''}
              {'pct' in trend ? `${Math.round(trend.pct)}%` : `${trend.pp.toFixed(1)}pp`}
            </span>
            <span className={isGradient ? 'opacity-80' : 'text-slate-400'}>vs kỳ trước</span>
          </p>
        )}
        {!trend && subtitle == null && previousValue != null && (
          <p className="text-[10px] text-slate-400">trước: {fmtNum(previousValue)}</p>
        )}
      </div>

      {miniBar && <KpiMiniBarInline miniBar={miniBar} isGradient={isGradient} />}
    </div>
  );
}

/**
 * Mini-bar 2-segment cùng 1 màu (segment 2 opacity nhạt).
 * Legend "Khách hàng mới · Khách hàng cũ" luôn hiển thị dưới bar - không cần hover.
 * Hover bar phình to + tooltip chi tiết hiện ra. Animation shimmer chạy nhẹ trên segment 1
 * để bar nổi bật như interactive element.
 * `mt-auto` đẩy bar xuống đáy card -> các card cùng grid có chiều cao bằng nhau.
 */
function KpiMiniBarInline({ miniBar, isGradient }: { miniBar: KpiMiniBar; isGradient: boolean }) {
  const r1 = Math.max(0, Math.min(100, miniBar.ratio));
  const r2 = 100 - r1;
  const seg1Cls = isGradient ? 'bg-white' : 'bg-sky-500';
  const seg2Cls = isGradient ? 'bg-white/40' : 'bg-sky-500/35';
  const trackCls = isGradient ? 'bg-white/20' : 'bg-slate-100';
  const legendCls = isGradient ? 'text-white/90' : 'text-slate-500';
  const dotNewCls = isGradient ? 'bg-white' : 'bg-sky-500';
  const dotRetCls = isGradient ? 'bg-white/40' : 'bg-sky-500/40';
  const tooltipText = miniBar.tooltipLines.join('\n');

  return (
    <div className="group/bar relative mt-auto cursor-pointer pt-3">
      <div className={`relative flex h-2 overflow-hidden rounded-full transition-all duration-200 group-hover/bar:h-2.5 group-hover/bar:shadow-[0_4px_12px_rgba(14,165,233,0.35)] ${trackCls}`}>
        <div className={`relative overflow-hidden ${seg1Cls}`} style={{ width: `${r1}%` }}>
          {/* Shimmer chạy ngang segment 1 - visual cue "interactive" */}
          <div className="absolute inset-y-0 w-1/3 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
        <div className={seg2Cls} style={{ width: `${r2}%` }} />
      </div>

      {/* Legend luôn hiển thị - user thấy rõ "đây là bar KH mới vs KH cũ" mà không cần hover */}
      <div className={`mt-1.5 flex items-center justify-between text-[10px] font-medium ${legendCls}`}>
        <span className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${dotNewCls}`} />
          Khách hàng mới
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${dotRetCls}`} />
          Khách hàng cũ
        </span>
      </div>

      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 z-10 min-w-[200px] -translate-x-1/2 whitespace-pre-line rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover/bar:opacity-100"
      >
        {tooltipText}
      </div>
    </div>
  );
}
