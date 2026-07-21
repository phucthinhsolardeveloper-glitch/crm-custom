'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EditOrderDialog } from '@/components/orders/edit-order-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import type { OrderRecord } from '@/types/entities';

interface OrderActionsProps {
  order: OrderRecord;
}

/** Action bar for order detail: change status, delete. */
export function OrderActions({ order }: OrderActionsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;

  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const statusAction = useFormAction({ successMessage: 'Đã cập nhật trạng thái đơn hàng' });
  const deleteAction = useFormAction({ successMessage: 'Đã xóa đơn hàng' });

  return (
    <div className="flex flex-wrap gap-2">
      {/* Edit order details */}
      {isManager && (
        <>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" />Sửa đơn
          </Button>
          <EditOrderDialog
            orderId={String(order.id)}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSuccess={() => router.refresh()}
          />
        </>
      )}

      {/* Change Status */}
      {isManager && (
        <>
          <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>Đổi trạng thái</Button>
          <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Đổi trạng thái đơn hàng</DialogTitle></DialogHeader>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Chờ xử lý</SelectItem>
                  <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStatusOpen(false)}>Hủy</Button>
                <Button
                  disabled={!newStatus || statusAction.isLoading}
                  onClick={async () => {
                    const r = await statusAction.execute('patch', `/orders/${order.id}/status`, { status: newStatus });
                    if (r) setStatusOpen(false);
                  }}
                >
                  {statusAction.isLoading ? 'Đang xử lý...' : 'Lưu'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Delete */}
      {isAdmin && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" />Xóa</Button>}
          title="Xóa đơn hàng"
          description={`Bạn có chắc muốn xóa đơn hàng #${order.id}?`}
          confirmLabel="Xóa"
          onConfirm={() => deleteAction.execute('delete', `/orders/${order.id}`)}
          isLoading={deleteAction.isLoading}
        />
      )}
    </div>
  );
}
