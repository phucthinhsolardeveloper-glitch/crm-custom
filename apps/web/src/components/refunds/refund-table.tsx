'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CreateRefundDialog } from '@/components/refunds/create-refund-dialog';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { formatVND, formatDate } from '@/lib/utils';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { RefundRecord } from '@/types/entities';

export function RefundTable({ refunds }: { refunds: RefundRecord[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const isManagerPlus = ['SUPER_ADMIN', 'MANAGER'].includes(user?.role || '');
  const [editing, setEditing] = useState<RefundRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Chủ sở hữu (mình tạo) hoặc MANAGER+ mới sửa/xóa được. Backend cũng chặn lần nữa.
  const canEdit = (r: RefundRecord) => isManagerPlus || (!!user && r.createdBy === user.id);

  // Tiền VAT nằm trong giá: giá = giá gốc + VAT -> vat = giá*vatRate/(100+vatRate).
  const vatOf = (r: RefundRecord) => {
    const price = Number(r.productPrice) || 0;
    const rate = Number(r.vatRate) || 0;
    return price > 0 && rate > 0 ? Math.round(price * rate / (100 + rate)) : 0;
  };

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await api.delete(`/refunds/${deletingId}`);
      toast.success('Đã xóa dòng hoàn tiền');
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi xóa');
    } finally {
      setDeletingId(null);
    }
  }

  if (refunds.length === 0) {
    return <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">Chưa có dòng hoàn tiền nào.</div>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Tên khách</th>
              <th className="px-3 py-2 font-medium">SĐT</th>
              <th className="px-3 py-2 font-medium">Sản phẩm</th>
              <th className="px-3 py-2 font-medium text-right">Doanh thu công ty</th>
              <th className="px-3 py-2 font-medium text-right">% VAT</th>
              <th className="px-3 py-2 font-medium text-right">Tiền VAT</th>
              <th className="px-3 py-2 font-medium">Nhóm</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Ngày hoàn</th>
              <th className="px-3 py-2 font-medium text-right">Số tiền hoàn</th>
              <th className="px-3 py-2 font-medium">Hình thức</th>
              <th className="px-3 py-2 font-medium">Ngân hàng</th>
              <th className="px-3 py-2 font-medium">Bill</th>
              <th className="px-3 py-2 font-medium">Nhân viên</th>
              <th className="px-3 py-2 font-medium">Ghi chú</th>
              <th className="px-3 py-2 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {refunds.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">{r.customerName || '-'}</td>
                <td className="px-3 py-2">{r.customerPhone || '-'}</td>
                <td className="px-3 py-2">{r.productName || '-'}</td>
                <td className="px-3 py-2 text-right">{r.productPrice ? formatVND(Number(r.productPrice)) : '-'}</td>
                <td className="px-3 py-2 text-right">{r.vatRate != null ? `${Number(r.vatRate)}%` : '-'}</td>
                <td className="px-3 py-2 text-right">{vatOf(r) ? formatVND(vatOf(r)) : '-'}</td>
                <td className="px-3 py-2">{r.groupName || '-'}</td>
                <td className="px-3 py-2">{r.teamName || '-'}</td>
                <td className="px-3 py-2">{r.refundDate ? formatDate(r.refundDate) : '-'}</td>
                <td className="px-3 py-2 text-right font-medium text-sky-600">{formatVND(Number(r.amount))}</td>
                <td className="px-3 py-2">{r.refundMethod || '-'}</td>
                <td className="px-3 py-2">{r.refundBank || '-'}</td>
                <td className="px-3 py-2">
                  {r.billImage
                    ? <a href={`/api/proxy/files/${r.billImage}`} target="_blank" rel="noreferrer" className="text-sky-600 underline">Xem</a>
                    : '-'}
                </td>
                <td className="px-3 py-2">{r.creator?.name || '-'}</td>
                <td className="px-3 py-2 max-w-[200px] truncate" title={r.notes || ''}>{r.notes || '-'}</td>
                <td className="px-3 py-2">
                  {canEdit(r) && (
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setDeletingId(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <CreateRefundDialog
          refund={editing}
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(null); }}
          hideDefaultTrigger
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(v) => { if (!v) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa dòng hoàn tiền?</AlertDialogTitle>
            <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
