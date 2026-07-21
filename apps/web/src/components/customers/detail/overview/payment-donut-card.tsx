'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatCompactMoney } from '@/lib/utils';
import { pickDonutColor } from '@/lib/donut-colors';
import { PaymentDonutChart, type DonutDatum, getKey } from './payment-donut-chart';
import { PaymentDonutLegend } from './payment-donut-legend';

interface RawProduct {
  productId: string | null;
  name: string;
  revenue: number;
  orders: number;
  percent: number;
}

interface ApiResp {
  data: {
    products: RawProduct[];
    totalRevenue: number;
    deltaPercent: number | null;
  };
}

/** HERO card: doanh thu theo sản phẩm, donut chart + legend interactive. */
export function PaymentDonutCard({ customerId }: { customerId: string }) {
  const [resp, setResp] = useState<ApiResp['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiResp>(`/customers/${customerId}/revenue-by-product`)
      .then((r) => !cancelled && setResp(r.data))
      .catch(() => !cancelled && setError('Không tải được doanh thu'));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const colored: DonutDatum[] = useMemo(() => {
    if (!resp) return [];
    return resp.products.map((p, i) => ({
      ...p,
      color: pickDonutColor(i, p.productId === null),
    }));
  }, [resp]);

  const hoveredItem = colored.find((d) => getKey(d) === hoveredKey) ?? null;

  if (error) {
    return <Wrapper><p className="text-xs text-red-600">{error}</p></Wrapper>;
  }
  if (resp === null) {
    return (
      <Wrapper>
        <div className="flex items-center justify-center h-[280px]">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      </Wrapper>
    );
  }
  if (colored.length === 0) {
    return (
      <Wrapper>
        <div className="flex flex-col items-center justify-center text-center py-10">
          <div className="text-4xl mb-2">📊</div>
          <div className="font-bold text-slate-700">Chưa có doanh thu</div>
          <div className="text-xs text-slate-500 mt-1">Tạo đơn hàng đầu tiên để xem phân tích</div>
        </div>
      </Wrapper>
    );
  }

  const displayValue = hoveredItem ? hoveredItem.revenue : resp.totalRevenue;
  const displayLabel = hoveredItem ? hoveredItem.name : 'Tổng doanh thu';

  return (
    <Wrapper>
      <h5 className="text-sm font-bold text-slate-800 mb-2">💰 Doanh thu theo sản phẩm</h5>
      <div className="relative">
        <PaymentDonutChart data={colored} hoveredKey={hoveredKey} onHover={setHoveredKey} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider line-clamp-1">
            {displayLabel}
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
            {formatCompactMoney(displayValue)}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold">VND</div>
          {!hoveredItem && resp.deltaPercent !== null && (
            <div
              className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                resp.deltaPercent >= 0
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-red-700 bg-red-50'
              }`}
            >
              {resp.deltaPercent >= 0 ? '↑' : '↓'} {Math.abs(resp.deltaPercent)}% /3 tháng
            </div>
          )}
        </div>
      </div>
      <PaymentDonutLegend data={colored} activeKey={hoveredKey} onSelect={setHoveredKey} />
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm h-full transition-shadow hover:shadow-md">
      {children}
    </div>
  );
}
