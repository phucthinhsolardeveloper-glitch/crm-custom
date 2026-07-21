'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { CreatePaymentDialog } from '@/components/payments/create-payment-dialog';
import { EditPaymentOnlyDialog } from '@/components/orders/edit-payment-only-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { formatDate, formatVND } from '@/lib/utils';
import { Plus, CheckCircle, XCircle, Trash2, RotateCcw, Ban, Pencil } from 'lucide-react';
import type { PaymentRecord, NamedEntity } from '@/types/entities';

interface PaymentActionsProps {
  orderId: string;
  payments: PaymentRecord[];
  paymentTypes: NamedEntity[];
  /** Pre-fetched installments from server; CreatePaymentDialog tu fetch neu rong. */
  paymentInstallments?: NamedEntity[];
  /** Pre-fetched bank accounts; CreatePaymentDialog tu fetch neu rong. */
  bankAccounts?: NamedEntity[];
  /** Order-level VAT rate for auto-calculating payment VAT amount. */
  vatRate?: number;
  /** Tong tien don hang - de hien thi tong/da TT/con lai trong dialog. */
  orderTotalAmount?: number;
  /** Ten san pham hien thi o subtitle dialog. */
  productName?: string;
  /** Creator ID cua order (de kiem tra quyen huy). */
  orderCreatedById?: string;
  /** Bang Lark cua don cha - lam mac dinh cho payment moi. */
  orderLarkSyncId?: string;
}

/** Dialog nhap ly do cho reject/cancel/refund (ly do tuy chon). */
function ReasonDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  onConfirm,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}) {
  const [reason, setReason] = useState('');

  function handleConfirm() {
    onConfirm(reason);
    setReason('');
  }

  function handleClose(v: boolean) {
    if (!v) setReason('');
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <label className="text-sm text-slate-600 block mb-1.5">
            Ly do <span className="text-slate-400 text-xs">(tuy chon)</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhap ly do..."
            rows={3}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isLoading}>
            Huy
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Dang xu ly...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Payment section with create (reusable dialog), verify, reject, cancel, refund actions. */
export function PaymentActions({
  orderId,
  payments,
  paymentTypes,
  paymentInstallments = [],
  bankAccounts = [],
  vatRate = 0,
  orderTotalAmount,
  productName,
  orderCreatedById,
  orderLarkSyncId,
}: PaymentActionsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [createOpen, setCreateOpen] = useState(false);
  const isManager = user?.role === 'MANAGER' || isSuperAdmin;
  // Payment-only edit dialog (USER/LEADER sua payment PENDING cua chinh minh).
  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);

  // Reject dialog state
  const [rejectPaymentId, setRejectPaymentId] = useState<string | null>(null);
  // Refund dialog state
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);

  const verifyAction = useFormAction({ successMessage: 'Da xac nhan thanh toan' });
  const rejectAction = useFormAction({ successMessage: 'Da xu ly sai thong tin' });
  const cancelAction = useFormAction({ successMessage: 'Da huy thanh toan' });
  const refundAction = useFormAction({ successMessage: 'Da hoan tien' });
  const deleteAction = useFormAction({ successMessage: 'Da xoa thanh toan' });

  // Da thanh toan = tong cac payment da VERIFIED. Dung cho tom tat trong dialog.
  const paidAmount = payments
    .filter(p => p.status === 'VERIFIED')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const orderSummary = orderTotalAmount !== undefined
    ? { totalAmount: orderTotalAmount, paidAmount, productName }
    : undefined;

  // SUPER_ADMIN huy bat ky payment PENDING. Nguoi khac chi huy payment PENDING DO CHINH MINH tao
  // (payment.created_by). Payment cu (created_by NULL) fallback ve nguoi tao don - khop backend cancel().
  function canCancel(p: PaymentRecord): boolean {
    if (p.status !== 'PENDING') return false;
    if (isSuperAdmin) return true;
    if (!user?.id) return false;
    const ownerId = p.createdBy != null ? p.createdBy : orderCreatedById;
    return ownerId != null && String(user.id) === String(ownerId);
  }

  // USER/LEADER sua payment PENDING DO CHINH MINH tao. MANAGER+ sua qua nut rieng (EditOrderDialog o list),
  // nen o day chi hien nut sua payment-only cho non-manager. Backend enforce lai quyen + PENDING.
  function canEditPayment(p: PaymentRecord): boolean {
    if (isManager) return false;
    if (p.status !== 'PENDING') return false;
    if (!user?.id) return false;
    const ownerId = p.createdBy != null ? p.createdBy : orderCreatedById;
    return ownerId != null && String(user.id) === String(ownerId);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Thanh toan ({payments.length})</h3>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Them TT
        </Button>
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-slate-400">Chua co thanh toan</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={p.status} />
                    <span className="text-sm font-medium">{formatVND(Number(p.amount))}</span>
                    {p.installment && (
                      <span className="text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{p.installment.name}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                    {p.paymentType?.name && <span>{p.paymentType.name}</span>}
                    {p.bankAccount?.name && <span>TK: {p.bankAccount.name}</span>}
                    {p.transferDate && <span>Ngay CK: {formatDate(p.transferDate)}</span>}
                    {p.transferContent && <span>ND: {p.transferContent}</span>}
                    {p.vatAmount && Number(p.vatAmount) > 0 && <span>VAT: {formatVND(Number(p.vatAmount))}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Verify + Reject: chi SUPER_ADMIN, payment PENDING */}
                  {p.status === 'PENDING' && isSuperAdmin && (
                    <>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Xac nhan">
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          </Button>
                        }
                        title="Xac nhan thanh toan"
                        description="Xac nhan da nhan duoc thanh toan nay?"
                        confirmLabel="Xac nhan"
                        onConfirm={() => verifyAction.execute('post', `/payments/${p.id}/verify`)}
                        isLoading={verifyAction.isLoading}
                      />
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8" title="Sai thong tin"
                        onClick={() => setRejectPaymentId(String(p.id))}
                      >
                        <XCircle className="h-4 w-4 text-orange-500" />
                      </Button>
                    </>
                  )}

                  {/* Sua payment-only: USER/LEADER sua payment PENDING cua chinh minh. */}
                  {canEditPayment(p) && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8" title="Sua thanh toan"
                      onClick={() => setEditPaymentId(String(p.id))}
                    >
                      <Pencil className="h-4 w-4 text-amber-500" />
                    </Button>
                  )}

                  {/* Huy = xoa thang ban ghi PENDING. Hien cho nguoi tao (khong phai super admin -
                      super admin da co nut xoa o duoi cho moi status). */}
                  {canCancel(p) && !isSuperAdmin && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Huy thanh toan">
                          <Ban className="h-4 w-4 text-red-500" />
                        </Button>
                      }
                      title="Huy thanh toan"
                      description={`Huy va xoa thanh toan ${formatVND(Number(p.amount))}? Thao tac nay khong the hoan tac.`}
                      confirmLabel="Huy thanh toan"
                      onConfirm={() => cancelAction.execute('post', `/payments/${p.id}/cancel`)}
                      isLoading={cancelAction.isLoading}
                    />
                  )}

                  {/* Refund: chi SUPER_ADMIN, khi VERIFIED */}
                  {p.status === 'VERIFIED' && isSuperAdmin && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8" title="Hoan tien"
                      onClick={() => setRefundPaymentId(String(p.id))}
                    >
                      <RotateCcw className="h-4 w-4 text-slate-500" />
                    </Button>
                  )}

                  {/* Xoa payment: chi SUPER_ADMIN, ap dung cho moi status. */}
                  {isSuperAdmin && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Xoa thanh toan">
                          <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-500" />
                        </Button>
                      }
                      title="Xoa thanh toan"
                      description={
                        p.status === 'VERIFIED'
                          ? `Xoa thanh toan ${formatVND(Number(p.amount))} da xac nhan? Se tu revert bank transaction match. Lead status KHONG revert.`
                          : `Xoa thanh toan ${formatVND(Number(p.amount))} (status: ${p.status})?`
                      }
                      confirmLabel="Xoa"
                      onConfirm={() => deleteAction.execute('delete', `/payments/${p.id}`)}
                      isLoading={deleteAction.isLoading}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreatePaymentDialog
        orderId={orderId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => router.refresh()}
        paymentTypes={paymentTypes}
        paymentInstallments={paymentInstallments}
        bankAccounts={bankAccounts}
        vatRate={vatRate}
        orderSummary={orderSummary}
        defaultLarkSyncId={orderLarkSyncId}
      />

      {/* Reject dialog */}
      <ReasonDialog
        open={!!rejectPaymentId}
        onOpenChange={(v) => { if (!v) setRejectPaymentId(null); }}
        title="Sai thong tin thanh toan"
        confirmLabel="Xac nhan"
        isLoading={rejectAction.isLoading}
        onConfirm={async (reason) => {
          const ok = await rejectAction.execute('post', `/payments/${rejectPaymentId}/reject`, reason ? { reason } : undefined);
          if (ok !== null) setRejectPaymentId(null);
        }}
      />

      {/* Refund dialog */}
      <ReasonDialog
        open={!!refundPaymentId}
        onOpenChange={(v) => { if (!v) setRefundPaymentId(null); }}
        title="Hoan tien thanh toan"
        confirmLabel="Hoan tien"
        isLoading={refundAction.isLoading}
        onConfirm={async (reason) => {
          const ok = await refundAction.execute('post', `/payments/${refundPaymentId}/refund`, reason ? { reason } : undefined);
          if (ok !== null) setRefundPaymentId(null);
        }}
      />

      {/* Sua payment-only (USER/LEADER sua payment PENDING cua chinh minh) */}
      {editPaymentId && (
        <EditPaymentOnlyDialog
          paymentId={editPaymentId}
          open={!!editPaymentId}
          onOpenChange={(v) => { if (!v) setEditPaymentId(null); }}
          onSuccess={() => { setEditPaymentId(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
