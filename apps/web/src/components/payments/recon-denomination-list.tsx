'use client';

import React, { useMemo, useState } from 'react';
import { formatVND, formatDate, formatDateTime } from '@/lib/utils';
import { ChevronRight, ChevronDown, Unlink } from 'lucide-react';
import type { DenominationGroup, DenominationPair, ReconPayment, ReconBankTx } from '@/types/entities';

/**
 * Danh sach m/nh gia (accordion) - moi cap Sale|diem|Bank co checkbox 2 ben.
 * Cap may ghep diem cao xep cung hang. Dong da xu ly (payment !=PENDING /
 * bank !=UNMATCHED) -> mac dinh THU GON (1 hang tom tat), bam de xo full chi tiet;
 * khoa checkbox, thay diem bang nhan trang thai.
 * Thuan hien thi: chon/thao tac do parent (recon-step-results) quan.
 */

type FilterKey = 'all' | 'err' | 'warn' | 'ok';

interface Props {
  denominations: DenominationGroup[];
  canApprove: boolean;
  selPayments: Set<string>;
  selBanks: Set<string>;
  onToggle: (kind: 'p' | 'b', id: string) => void;
  onUnmatch: (bankTxId: string) => void;
  busy: boolean;
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'err', label: 'Chưa khớp' },
  { key: 'warn', label: 'Chưa map hết' },
  { key: 'ok', label: 'Hoàn tất' },
];

const STATUS: Record<DenominationGroup['status'], { label: string; cls: string; bar: string }> = {
  ok: { label: 'Hoàn tất', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'border-l-emerald-400' },
  warn: { label: 'Chưa map hết', cls: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'border-l-amber-400' },
  err: { label: 'Lệch', cls: 'bg-red-50 text-red-700 border-red-200', bar: 'border-l-red-400' },
};

const isPayDone = (p: DenominationPair) => !!p.payment && p.payment.status !== 'PENDING';
const isBankDone = (p: DenominationPair) => !!p.bankTx && p.bankTx.matchStatus !== 'UNMATCHED';
const isLocked = (p: DenominationPair) => isPayDone(p) || isBankDone(p);

const DONE_LABEL: Record<string, string> = {
  VERIFIED: '✓ đã duyệt', REJECTED: '✗ đã từ chối', REFUNDED: '↩ đã hoàn tiền',
};

// Key on dinh cho 1 pair (dung theo doi dong locked nao dang xo).
const pairKey = (p: DenominationPair, i: number) => p.paymentId ?? p.bankTxId ?? String(i);

export function ReconDenominationList({ denominations, canApprove, selPayments, selBanks, onToggle, onUnmatch, busy }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [openAmounts, setOpenAmounts] = useState<Set<number>>(() => new Set(denominations.filter((d) => d.status !== 'ok').map((d) => d.amount)));
  // Cac dong locked dang duoc xo chi tiet (mac dinh thu gon).
  const [openLocked, setOpenLocked] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => (filter === 'all' ? denominations : denominations.filter((d) => d.status === filter)), [denominations, filter]);

  function toggleOpen(amount: number) {
    setOpenAmounts((prev) => {
      const next = new Set(prev);
      next.has(amount) ? next.delete(amount) : next.add(amount);
      return next;
    });
  }

  function toggleLocked(key: string) {
    setOpenLocked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.key ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.map((g) => {
        const st = STATUS[g.status];
        const open = openAmounts.has(g.amount);
        return (
          <div key={g.amount} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggleOpen(g.amount)}
              className={`flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left ${st.bar}`}
            >
              <span className="min-w-[140px] text-lg font-extrabold tabular-nums text-slate-800">{formatVND(g.amount)}</span>
              <span className="flex-1 text-xs text-slate-500">
                {g.saleCount} Sale / {g.bankCount} Bank - đã ghép {g.mappedCount}/{g.pairTotal}
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
              <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>

            {open && (
              <div className="border-t border-slate-100 p-3 pt-1">
                {g.pairs.map((p, i) => {
                  const key = pairKey(p, i);
                  return (
                    <PairRow
                      key={key}
                      pair={p}
                      canApprove={canApprove}
                      selPayments={selPayments}
                      selBanks={selBanks}
                      onToggle={onToggle}
                      onUnmatch={onUnmatch}
                      busy={busy}
                      lockedOpen={openLocked.has(key)}
                      onToggleLocked={() => toggleLocked(key)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 1 hang nhan:gia tri gon (label mo + value dam). */
function InfoLine({ label, value, valueCls = 'text-slate-600' }: { label: string; value: string; valueCls?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 text-[11px]">
      <span className="shrink-0 text-slate-400">{label}:</span>
      <span className={`truncate font-medium ${valueCls}`}>{value}</span>
    </div>
  );
}

/** Chi tiet phieu Sale - dung chung cho dong PENDING va dong locked da xo. */
function SaleDetail({ sale }: { sale: ReconPayment }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="truncate text-xs font-semibold text-slate-700">{sale.customerName || 'Không rõ tên'}</div>
      <InfoLine label="SP" value={sale.productName || '-'} />
      <InfoLine label="Nguồn" value={sale.sourceName || '-'} valueCls="text-sky-600" />
      <InfoLine label="Lần TT" value={sale.installmentName || '-'} />
      <InfoLine label="Ngày CK" value={sale.transferDate ? formatDate(sale.transferDate) : '-'} />
      <InfoLine label="Ngày tạo" value={sale.createdAt ? formatDate(sale.createdAt) : '-'} />
      <InfoLine label="ND" value={sale.transferContent || '-'} />
    </div>
  );
}

/** Chi tiet giao dich Bank (can phai). */
function BankDetail({ bank }: { bank: ReconBankTx }) {
  return (
    <div className="min-w-0 space-y-0.5 text-right">
      <div className="truncate text-xs font-semibold text-slate-700">{bank.senderName || 'Không rõ người CK'}</div>
      <div className="truncate text-[11px] text-slate-400">{bank.transactionTime ? formatDateTime(bank.transactionTime) : '-'}</div>
      <div className="truncate text-[11px] text-slate-500">{bank.content}</div>
    </div>
  );
}

function PairRow({ pair, canApprove, selPayments, selBanks, onToggle, onUnmatch, busy, lockedOpen, onToggleLocked }: {
  pair: DenominationPair; canApprove: boolean; selPayments: Set<string>; selBanks: Set<string>;
  onToggle: Props['onToggle']; onUnmatch: (bankTxId: string) => void; busy: boolean;
  lockedOpen: boolean; onToggleLocked: () => void;
}) {
  const sale = pair.payment;
  const bank = pair.bankTx;
  const full = !!sale && !!bank;
  const locked = isLocked(pair);
  const doneLabel = sale ? DONE_LABEL[sale.status] ?? '✓ xong' : '🐷 tiền dư';
  // Cap ghep that su (bank tx da match) -> cho huy ghep. IGNORED (tien du) khong tinh.
  const canUnmatch = canApprove && !!bank
    && ['AUTO_MATCHED', 'MANUALLY_MATCHED', 'FUZZY_MATCHED'].includes(bank.matchStatus);

  // Dong da xu ly: mac dinh thu gon (1 hang tom tat), bam de xo full.
  if (locked) {
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-100/70">
        <button
          type="button"
          onClick={onToggleLocked}
          className="grid w-full grid-cols-[1fr_100px_1fr_20px] items-center gap-2 p-2.5 text-left"
        >
          <span className="truncate text-xs font-semibold text-slate-600">{sale ? sale.customerName || '-' : <span className="text-slate-400">-</span>}</span>
          <span className="text-center text-[11px] font-bold text-emerald-600">{doneLabel}</span>
          <span className="truncate text-right text-xs font-semibold text-slate-600">{bank ? bank.senderName || '-' : <span className="text-slate-400">-</span>}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${lockedOpen ? 'rotate-180' : ''}`} />
        </button>
        {lockedOpen && (
          <div className="border-t border-slate-200 bg-white/60 p-2.5">
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              {sale ? <SaleDetail sale={sale} /> : <div className="text-xs italic text-slate-300">(không có phiếu Sale)</div>}
              {bank ? <BankDetail bank={bank} /> : <div className="text-right text-xs italic text-slate-300">(không có giao dịch NH)</div>}
            </div>
            {canUnmatch && bank && (
              <div className="mt-2.5 flex justify-end border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  onClick={() => onUnmatch(bank.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-50 hover:bg-red-50"
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Huỷ ghép
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const selP = !!sale && selPayments.has(sale.id);
  const selB = !!bank && selBanks.has(bank.id);

  return (
    <div className={`mt-2 grid grid-cols-[24px_1fr_90px_1fr_24px] items-center gap-2 rounded-lg border p-2.5 ${full ? 'border-emerald-100 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="flex justify-center">
        {sale && <input type="checkbox" disabled={!canApprove} checked={selP} onChange={() => onToggle('p', sale.id)} className="h-4 w-4 accent-sky-500" />}
      </div>
      {sale ? (
        <div className={`min-w-0 rounded-md px-1.5 py-1 ${selP ? 'bg-sky-100 ring-1 ring-sky-400' : ''}`}>
          <SaleDetail sale={sale} />
        </div>
      ) : (
        <div className="text-xs italic text-slate-300">(không có phiếu Sale)</div>
      )}

      <div className="text-center">
        {full ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${pair.score >= 65 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{pair.score}đ</span>
        ) : (
          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-400">lẻ</span>
        )}
        {full && pair.score >= 65 && <div className="mt-0.5 text-[9px] font-bold text-emerald-600">máy ghép</div>}
      </div>

      {bank ? (
        <div className={`min-w-0 rounded-md px-1.5 py-1 ${selB ? 'bg-sky-100 ring-1 ring-sky-400' : ''}`}>
          <BankDetail bank={bank} />
        </div>
      ) : (
        <div className="text-right text-xs italic text-slate-300">(không có giao dịch NH)</div>
      )}
      <div className="flex justify-center">
        {bank && <input type="checkbox" disabled={!canApprove} checked={selB} onChange={() => onToggle('b', bank.id)} className="h-4 w-4 accent-sky-500" />}
      </div>
    </div>
  );
}
