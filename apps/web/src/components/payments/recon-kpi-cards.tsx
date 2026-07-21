'use client';

import React from 'react';
import { formatVND } from '@/lib/utils';
import { CheckCircle2, Receipt, Link2, Coins } from 'lucide-react';
import type { ReconciliationResult } from '@/types/entities';

/** 4 KPI tổng quan cho kết quả đối soát (theo mockup). */
export function ReconKpiCards({ summary }: { summary: ReconciliationResult['summary'] }) {
  const cards = [
    {
      label: 'Mệnh giá đã khớp',
      value: `${summary.okDenomCount}/${summary.totalDenomCount}`,
      hint: 'Số mệnh giá cân bằng SL + tiền',
      icon: CheckCircle2,
      tone: 'text-emerald-600 border-emerald-100 bg-emerald-50',
    },
    {
      label: 'SL phiếu Sale / Bank',
      value: `${summary.saleTxTotal} / ${summary.bankTxTotal}`,
      hint: 'Tổng số giao dịch 2 phía',
      icon: Receipt,
      tone: 'text-sky-600 border-sky-100 bg-sky-50',
    },
    {
      label: 'Đã map ND + tên',
      value: `${summary.mappedGrandTotal}/${summary.pairGrandTotal}`,
      hint: 'Số cặp đã ghép được',
      icon: Link2,
      tone: 'text-violet-600 border-violet-100 bg-violet-50',
    },
    {
      label: 'Tổng tiền Sale / Bank',
      value: summary.grandDiff === 0 ? 'Khớp' : formatVND(summary.grandDiff),
      hint: `${formatVND(summary.saleGrandSum)} / ${formatVND(summary.bankGrandSum)}`,
      icon: Coins,
      tone: summary.grandDiff === 0
        ? 'text-emerald-600 border-emerald-100 bg-emerald-50'
        : 'text-red-600 border-red-100 bg-red-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className={`rounded-xl border p-4 ${c.tone}`}>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
              <Icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="text-2xl font-extrabold tabular-nums">{c.value}</div>
            <div className="mt-0.5 text-xs opacity-80">{c.hint}</div>
          </div>
        );
      })}
    </div>
  );
}
