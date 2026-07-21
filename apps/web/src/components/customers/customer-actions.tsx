'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { UserPlus, ArrowRightLeft, RotateCcw, Trash2, Tag } from 'lucide-react';
import type { CustomerRecord, NamedEntity, LabelEntity } from '@/types/entities';

interface CustomerActionsProps {
  customer: CustomerRecord;
  departments: NamedEntity[];
  labels: LabelEntity[];
}

/** Action bar for customer detail page. */
export function CustomerActions({ customer, departments, labels }: CustomerActionsProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;

  const [transferOpen, setTransferOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [transferType, setTransferType] = useState('');
  const [transferDeptId, setTransferDeptId] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const claimAction = useFormAction({ successMessage: 'Đã nhận khách hàng' });
  const transferAction = useFormAction({ successMessage: 'Đã chuyển khách hàng' });
  const reactivateAction = useFormAction({ successMessage: 'Đã kích hoạt lại' });
  const deleteAction = useFormAction({ successMessage: 'Đã xóa khách hàng' });
  const labelAction = useFormAction({ successMessage: 'Đã gắn nhãn' });

  const canClaim = customer.status === 'FLOATING';

  return (
    <div className="flex flex-wrap gap-2">
      {/* Claim */}
      {canClaim && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="outline"><UserPlus className="h-4 w-4 mr-1" />Nhận KH</Button>}
          title="Nhận khách hàng"
          description="Bạn muốn nhận khách hàng này?"
          confirmLabel="Nhận"
          onConfirm={() => claimAction.execute('post', `/customers/${customer.id}/claim`)}
          isLoading={claimAction.isLoading}
        />
      )}

      {/* Transfer */}
      <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
        <ArrowRightLeft className="h-4 w-4 mr-1" />Chuyển
      </Button>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Chuyển khách hàng</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={transferType} onValueChange={setTransferType}>
              <SelectTrigger><SelectValue placeholder="Chọn hình thức" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPARTMENT">Về phòng ban</SelectItem>
                <SelectItem value="FLOATING">Thả nổi</SelectItem>
                <SelectItem value="INACTIVE">Vô hiệu hóa</SelectItem>
              </SelectContent>
            </Select>
            {transferType === 'DEPARTMENT' && (
              <Select value={transferDeptId} onValueChange={setTransferDeptId}>
                <SelectTrigger><SelectValue placeholder="Chọn phòng ban" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Hủy</Button>
            <Button
              disabled={!transferType || transferAction.isLoading}
              onClick={async () => {
                const body: Record<string, string> = { targetType: transferType };
                if (transferType === 'DEPARTMENT') body.targetDeptId = transferDeptId;
                const r = await transferAction.execute('post', `/customers/${customer.id}/transfer`, body);
                if (r) setTransferOpen(false);
              }}
            >
              {transferAction.isLoading ? 'Đang xử lý...' : 'Chuyển'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate */}
      {customer.status === 'INACTIVE' && isManager && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="outline"><RotateCcw className="h-4 w-4 mr-1" />Kích hoạt lại</Button>}
          title="Kích hoạt lại khách hàng"
          description="Khách hàng sẽ được chuyển về trạng thái ACTIVE."
          confirmLabel="Kích hoạt"
          onConfirm={() => reactivateAction.execute('post', `/customers/${customer.id}/reactivate`)}
          isLoading={reactivateAction.isLoading}
        />
      )}

      {/* Labels */}
      <Button size="sm" variant="outline" onClick={() => setLabelOpen(true)}>
        <Tag className="h-4 w-4 mr-1" />Nhãn
      </Button>
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gắn nhãn</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">
            {labels.map(l => {
              const isSelected = selectedLabelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedLabelIds(prev =>
                    isSelected ? prev.filter(id => id !== l.id) : [...prev, l.id]
                  )}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${isSelected ? 'ring-2 ring-sky-500 text-white' : 'text-white opacity-60'}`}
                  style={{ backgroundColor: l.color }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelOpen(false)}>Hủy</Button>
            <Button
              disabled={selectedLabelIds.length === 0 || labelAction.isLoading}
              onClick={async () => {
                const r = await labelAction.execute('post', `/customers/${customer.id}/labels`, { labelIds: selectedLabelIds });
                if (r) { setLabelOpen(false); setSelectedLabelIds([]); }
              }}
            >
              {labelAction.isLoading ? 'Đang xử lý...' : 'Gắn nhãn'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      {isAdmin && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" />Xóa</Button>}
          title="Xóa khách hàng"
          description={`Bạn có chắc muốn xóa khách hàng "${customer.name}"?`}
          confirmLabel="Xóa"
          onConfirm={() => deleteAction.execute('delete', `/customers/${customer.id}`)}
          isLoading={deleteAction.isLoading}
        />
      )}
    </div>
  );
}
