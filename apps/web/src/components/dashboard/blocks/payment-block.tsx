'use client';

import type { TopNResponse } from '@crm/types';
import { type ReceivablesData, fmtNum, fmtVNDShort } from '../constants';
import { BlockSectionLabel } from './block-section-label';
import { TopNDonutCard } from '../h1/top-n-donut-card';
import { TopNListCard } from '../h1/top-n-list-card';
import { InfoTooltip } from '../widgets/info-tooltip';

interface PaymentBlockProps {
  byPaymentType: TopNResponse | null;
  byBankAccount: TopNResponse | null;
  receivables: ReceivablesData | null;
  loading: boolean;
}

/** Card "Công nợ": tổng tiền còn thiếu của mọi đơn chưa thu đủ trong kỳ. */
function DebtCard({ data, loading }: { data: ReceivablesData | null; loading: boolean }) {
  if (loading) {
    return <div className="h-[88px] animate-pulse rounded-xl bg-slate-100" />;
  }
  const hasDebt = (data?.debtAmount ?? 0) > 0;
  return (
    <div className={`rounded-xl border p-4 ${hasDebt ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-white'}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        💰 Công nợ
        <InfoTooltip text="Tổng tiền khách CÒN NỢ = SUM(giá trị đơn - đã thu thật) của mọi đơn tạo trong kỳ chưa thu đủ, KỂ CẢ đơn chưa trả đồng nào. Đã thu thật = VERIFIED + REJECTED. KHÁC với 'Chờ duyệt' bên dưới (chỉ là tiền khách đã nộp đang chờ admin duyệt) - nên 2 số không cộng khớp nhau." />
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`text-xl font-bold tabular-nums ${hasDebt ? 'text-amber-700' : 'text-slate-900'}`}>
          {fmtVNDShort(data?.debtAmount ?? 0)}
        </span>
        <span className="text-xs text-slate-500">từ {fmtNum(data?.debtOrderCount ?? 0)} đơn chưa thu đủ</span>
      </div>
    </div>
  );
}

/** Card "Đã xác minh vs chờ duyệt": so sánh tiền VERIFIED và PENDING trong kỳ. */
function VerifiedVsPendingCard({ data, loading }: { data: ReceivablesData | null; loading: boolean }) {
  if (loading) {
    return <div className="h-[120px] animate-pulse rounded-xl bg-slate-100" />;
  }
  const verified = data?.verifiedAmount ?? 0;
  const pending = data?.pendingAmount ?? 0;
  const total = verified + pending;
  const verifiedPct = total > 0 ? Math.round((verified / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        ✅ Đã xác minh vs chờ duyệt
        <InfoTooltip text="Tiền đã xác minh (VERIFIED, theo ngày duyệt) so với tiền đang chờ admin duyệt (PENDING, theo ngày tạo) trong kỳ." />
      </div>
      <div className="mt-2 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Đã xác minh
          </span>
          <span className="text-sm font-bold tabular-nums text-emerald-700">{fmtVNDShort(verified)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Chờ duyệt
          </span>
          <span className="text-sm font-bold tabular-nums text-amber-600">{fmtVNDShort(pending)}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-emerald-500" style={{ width: `${verifiedPct}%` }} />
          <div className="bg-amber-400" style={{ width: `${100 - verifiedPct}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Block 3 - Thanh toán: hình thức TT (donut), tài khoản nhận,
 * công nợ + đã xác minh vs chờ duyệt.
 */
export function PaymentBlock({ byPaymentType, byBankAccount, receivables, loading }: PaymentBlockProps) {
  return (
    <section className="space-y-3">
      <BlockSectionLabel index={3} title="Thanh toán" question="Khách thích trả tiền qua kênh nào?" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopNDonutCard
          title="Hình thức thanh toán"
          icon="💳"
          data={byPaymentType}
          loading={loading}
          infoTooltip="Doanh thu payment đã verify trong kỳ theo hình thức thanh toán (CK, tiền mặt...)."
        />
        <TopNListCard
          title="Tài khoản nhận"
          icon="🏦"
          data={byBankAccount}
          loading={loading}
          infoTooltip="Doanh thu verified trong kỳ theo tài khoản ngân hàng nhận tiền. Dòng đỏ = payment không ghi tài khoản."
          highlightNames={['Không qua bank']}
        />
        <div className="flex flex-col gap-4">
          <DebtCard data={receivables} loading={loading} />
          <VerifiedVsPendingCard data={receivables} loading={loading} />
        </div>
      </div>
    </section>
  );
}
