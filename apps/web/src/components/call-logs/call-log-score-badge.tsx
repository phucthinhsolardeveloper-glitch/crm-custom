'use client';

/**
 * Score ring badge cho cuoc goi (0-10).
 * SVG conic - portable hon CSS conic-gradient, render dong nhat tren Firefox/Safari.
 * Size sm = 40px (row), md = 56px (expanded panel).
 */
import { cn } from '@/lib/utils';
import { scoreTone } from './call-log-helpers';

interface CallLogScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function CallLogScoreBadge({ score, size = 'sm', showLabel = false }: CallLogScoreBadgeProps) {
  const tone = scoreTone(score);
  const hasScore = typeof score === 'number';
  // Score thang 0-10 -> phan tram cho vong ring (score 8 -> 80%).
  const pct = hasScore ? Math.max(0, Math.min(10, score)) * 10 : 0;
  const dimension = size === 'sm' ? 40 : 56;
  const stroke = size === 'sm' ? 3 : 4;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div className={cn('flex flex-col items-center gap-0.5', size === 'sm' ? 'w-10' : 'w-14')}>
      <div className="relative" style={{ width: dimension, height: dimension }}>
        <svg viewBox="0 0 36 36" className="-rotate-90" style={{ width: dimension, height: dimension }}>
          <circle cx="18" cy="18" r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          {hasScore && (
            <circle
              cx="18" cy="18" r={radius} fill="none"
              stroke={tone.ringColor} strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          {hasScore ? (
            <span className={cn('font-extrabold leading-none', size === 'sm' ? 'text-xs' : 'text-base', tone.textColor)}>
              {Math.round(score)}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400">N/A</span>
          )}
        </div>
      </div>
      {showLabel && (
        <span className={cn('text-[10px] font-semibold', tone.textColor)}>{tone.label}</span>
      )}
    </div>
  );
}
