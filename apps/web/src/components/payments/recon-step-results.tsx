'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { Loader2, Link2, Check, PiggyBank, Ban, Trash2, X, Layers } from 'lucide-react';
import { formatVND } from '@/lib/utils';
import { ReconKpiCards } from './recon-kpi-cards';
import { ReconDenominationList } from './recon-denomination-list';
import type { ReconciliationResult, DenominationPair } from '@/types/entities';

/**
 * Buoc 3: KPI + danh sach menh gia voi checkbox 2 ben (Sale/Bank).
 * Tich dong -> action bar co dinh duoi hien nut phu hop:
 * - 1+ cap Sale+Bank full da chon -> Duyet nhanh.
 * - dung 1 Sale le + 1 Bank le -> Ghep cap (map tay). Cap may ghep sai khong
 *   can tach rieng: cap goi y chua luu DB, chi can match cap moi la thay the.
 * - chi cac Bank le -> Tien du (khong hoi ly do).
 * - co Sale duoc chon -> Tu choi / Xoa.
 * Chi SUPER_ADMIN (canApprove) thao tac.
 */

interface Props {
  result: ReconciliationResult;
  canApprove: boolean;
  onApproved: () => void;
}

export function ReconStepResults({ result, canApprove, onApproved }: Props) {
  const [selP, setSelP] = useState<Set<string>>(new Set());
  const [selB, setSelB] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Map id -> pair de biet pair full/le va payment/bank di kem.
  const { pairByPay, pairByBank } = useMemo(() => {
    const bp = new Map<string, DenominationPair>();
    const bb = new Map<string, DenominationPair>();
    for (const g of result.denominations) for (const p of g.pairs) {
      if (p.paymentId) bp.set(p.paymentId, p);
      if (p.bankTxId) bb.set(p.bankTxId, p);
    }
    return { pairByPay: bp, pairByBank: bb };
  }, [result]);

  function toggle(kind: 'p' | 'b', id: string) {
    if (kind === 'p') { const s = new Set(selP); s.has(id) ? s.delete(id) : s.add(id); setSelP(s); }
    else { const s = new Set(selB); s.has(id) ? s.delete(id) : s.add(id); setSelB(s); }
  }
  function clearSel() { setSelP(new Set()); setSelB(new Set()); }

  const payIds = [...selP];
  const bankIds = [...selB];

  // Cap full (Sale+Bank cung 1 pair) trong vung chon -> duyet duoc.
  const fullPairs = useMemo(
    () => payIds.map((id) => pairByPay.get(id)).filter((p): p is DenominationPair => !!p && !!p.paymentId && !!p.bankTxId && selB.has(p.bankTxId)),
    [payIds, selB, pairByPay],
  );
  const canApproveSel = fullPairs.length > 0;
  const canPair = payIds.length === 1 && bankIds.length === 1 && fullPairs.length === 0;
  const loneBanks = bankIds.map((id) => pairByBank.get(id)).filter((p): p is DenominationPair => !!p && !p.payment);
  const canSurplus = payIds.length === 0 && bankIds.length > 0 && loneBanks.length === bankIds.length;
  // Gop nhieu phieu Sale (>=2) vao 1 giao dich Bank: khach CK 1 lan gom nhieu don.
  // Cac phieu Sale phai con PENDING (chua duyet) moi verify duoc.
  const selPayList = payIds.map((id) => pairByPay.get(id)?.payment).filter((p): p is NonNullable<typeof p> => !!p);
  const allPending = selPayList.length === payIds.length && selPayList.every((p) => p.status === 'PENDING');
  const canGroupVerify = bankIds.length === 1 && payIds.length >= 2 && allPending;

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try { await fn(); toast.success(okMsg); clearSel(); onApproved(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Thao tác thất bại'); }
    finally { setBusy(false); }
  }

  function doApprove() {
    run(async () => { for (const p of fullPairs) await api.post(`/bank-transactions/${p.bankTxId}/match`, { paymentId: p.paymentId }); }, `Đã duyệt ${fullPairs.length} cặp`);
  }
  function doPair() {
    run(() => api.post(`/bank-transactions/${bankIds[0]}/match`, { paymentId: payIds[0] }), 'Đã ghép cặp + duyệt');
  }
  function doGroupVerify() {
    // 1 giao dich Bank chi gan FK 1 payment -> phieu dau match voi Bank, cac phieu
    // con lai verify khong kem Bank. Tat ca -> VERIFIED.
    const saleSum = selPayList.reduce((s, p) => s + Number(p.amount), 0);
    const bankAmount = Number(pairByBank.get(bankIds[0])?.bankTx?.amount ?? 0);
    if (saleSum !== bankAmount && !window.confirm(
      `Tổng ${payIds.length} phiếu Sale (${formatVND(saleSum)}) khác số tiền giao dịch Bank (${formatVND(bankAmount)}). Vẫn xác nhận gộp?`,
    )) return;
    run(async () => {
      const [firstPay, ...restPays] = payIds;
      await api.post(`/bank-transactions/${bankIds[0]}/match`, { paymentId: firstPay });
      for (const id of restPays) await api.post(`/payments/${id}/verify`, {});
    }, `Đã xác nhận gộp ${payIds.length} phiếu vào 1 giao dịch`);
  }
  function doSurplus() {
    run(async () => { for (const id of bankIds) await api.post(`/bank-transactions/${id}/mark-surplus`, {}); }, `Đã chuyển ${bankIds.length} giao dịch vào tiền dư`);
  }
  function doReject() {
    const reason = window.prompt('Lý do từ chối (tiền có về nhưng sale nhập sai):');
    if (reason === null) return;
    run(async () => { for (const id of payIds) await api.post(`/payments/${id}/reject`, { reason }); }, `Đã từ chối ${payIds.length} phiếu`);
  }
  function doCancel() {
    if (!window.confirm(`Xoá ${payIds.length} phiếu? (tạo nhầm, tiền KHÔNG về - xoá thẳng)`)) return;
    run(async () => { for (const id of payIds) await api.post(`/payments/${id}/cancel`, {}); }, `Đã xoá ${payIds.length} phiếu`);
  }
  // Huy ghep 1 cap da ghep nham: bank tx -> chua ghep, payment -> cho xac minh.
  function doUnmatch(bankTxId: string) {
    if (!window.confirm('Huỷ ghép cặp này? Giao dịch NH về "chưa khớp", phiếu Sale về "chờ xác minh".')) return;
    run(() => api.post(`/bank-transactions/${bankTxId}/unmatch`, {}), 'Đã huỷ ghép');
  }

  const hasSel = payIds.length > 0 || bankIds.length > 0;

  return (
    <div className="flex flex-col gap-4 pb-24">
      <ReconKpiCards summary={result.summary} />
      <ReconDenominationList denominations={result.denominations} canApprove={canApprove} selPayments={selP} selBanks={selB} onToggle={toggle} onUnmatch={doUnmatch} busy={busy} />

      {canApprove && hasSel && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-6 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="flex-1 text-sm font-semibold text-slate-600">
            Đang chọn <b className="text-sky-600">{payIds.length}</b> phiếu Sale + <b className="text-sky-600">{bankIds.length}</b> giao dịch Bank
          </div>
          {canPair && <BarBtn onClick={doPair} busy={busy} cls="bg-sky-500 text-white" icon={<Link2 className="h-4 w-4" />}>Ghép cặp</BarBtn>}
          {canGroupVerify && <BarBtn onClick={doGroupVerify} busy={busy} cls="bg-indigo-500 text-white" icon={<Layers className="h-4 w-4" />}>Xác nhận gộp</BarBtn>}
          {canApproveSel && <BarBtn onClick={doApprove} busy={busy} cls="bg-emerald-500 text-white" icon={<Check className="h-4 w-4" />}>Duyệt</BarBtn>}
          {canSurplus && <BarBtn onClick={doSurplus} busy={busy} cls="bg-violet-500 text-white" icon={<PiggyBank className="h-4 w-4" />}>Tiền dư</BarBtn>}
          {payIds.length > 0 && <BarBtn onClick={doReject} busy={busy} cls="border border-amber-300 bg-white text-amber-600" icon={<Ban className="h-4 w-4" />}>Từ chối</BarBtn>}
          {payIds.length > 0 && <BarBtn onClick={doCancel} busy={busy} cls="border border-red-300 bg-white text-red-600" icon={<Trash2 className="h-4 w-4" />}>Xoá</BarBtn>}
          <BarBtn onClick={clearSel} busy={false} cls="border border-slate-200 bg-white text-slate-500" icon={<X className="h-4 w-4" />}>Bỏ chọn</BarBtn>
        </div>
      )}
    </div>
  );
}

function BarBtn({ onClick, busy, cls, icon, children }: { onClick: () => void; busy: boolean; cls: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${cls}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
