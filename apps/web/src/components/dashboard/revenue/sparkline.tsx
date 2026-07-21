'use client';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}

/**
 * SVG polyline sparkline với gradient fill.
 * Render flat line khi data toàn 0 (max-min=0) để tránh divide-by-zero.
 */
export function Sparkline({ data, color = '#0ea5e9', height = 32, width = 80 }: SparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ height, width }} className="rounded bg-slate-50" />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / Math.max(data.length - 1, 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gradId = `spark-grad-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
