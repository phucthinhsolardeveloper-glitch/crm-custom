import { formatCompactMoney } from '@/lib/utils';

interface PayloadItem {
  payload: {
    productId: string | null;
    name: string;
    revenue: number;
    orders: number;
    percent: number;
    color: string;
  };
}

/** Custom tooltip cho Recharts Pie. `active` + `payload` được Recharts truyền vào. */
export function PaymentDonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: PayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="bg-slate-900 text-white rounded-xl px-3.5 py-2.5 shadow-xl min-w-[170px]"
      role="tooltip"
    >
      <div className="flex items-center gap-1.5 text-xs font-bold mb-1">
        <span
          className="w-2 h-2 rounded-sm"
          style={{ backgroundColor: p.color }}
          aria-hidden
        />
        <span className="truncate">{p.name}</span>
      </div>
      <div className="text-base font-extrabold">{formatCompactMoney(p.revenue)} VND</div>
      <div className="text-[11px] text-slate-400 mt-0.5">
        {p.percent.toFixed(1)}% · {p.orders} đơn
      </div>
    </div>
  );
}
