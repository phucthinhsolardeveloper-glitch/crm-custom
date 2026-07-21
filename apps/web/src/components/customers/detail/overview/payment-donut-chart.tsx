'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PaymentDonutTooltip } from './payment-donut-tooltip';

export interface DonutDatum {
  productId: string | null;
  name: string;
  revenue: number;
  orders: number;
  percent: number;
  color: string;
}

interface Props {
  data: DonutDatum[];
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
}

/** Recharts pie wrapper. `hoveredKey` = productId hoặc 'other' để sync với legend. */
export function PaymentDonutChart({ data, hoveredKey, onHover }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="revenue"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={68}
          outerRadius={98}
          paddingAngle={2}
          startAngle={90}
          endAngle={-270}
          isAnimationActive
          animationDuration={600}
          onMouseEnter={(_, idx) => onHover(getKey(data[idx]))}
          onMouseLeave={() => onHover(null)}
        >
          {data.map((d) => {
            const key = getKey(d);
            return (
              <Cell
                key={key}
                fill={d.color}
                stroke="#ffffff"
                strokeWidth={2}
                opacity={hoveredKey === null || hoveredKey === key ? 1 : 0.6}
                style={{ transition: 'opacity 150ms', cursor: 'pointer', outline: 'none' }}
              />
            );
          })}
        </Pie>
        <Tooltip
          content={<PaymentDonutTooltip />}
          wrapperStyle={{ zIndex: 10, outline: 'none' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function getKey(d: DonutDatum): string {
  return d.productId ?? 'other';
}
