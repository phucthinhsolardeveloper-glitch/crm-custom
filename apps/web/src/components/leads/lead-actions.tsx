'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import NoteDialog from '@/components/shared/note-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { UserPlus, ArrowRightLeft, Trash2, Tag, MessageSquarePlus } from 'lucide-react';
import type { LeadRecord, NamedEntity, LabelEntity } from '@/types/entities';

interface LeadActionsProps {
  lead: LeadRecord;
  users: NamedEntity[];
  departments: NamedEntity[];
  labels: LabelEntity[];
}

/** Action bar for lead detail page - assign, claim, transfer, convert, status, labels, notes. */
export function LeadActions({ lead, users, departments, labels }: LeadActionsProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;
  // Người đang giữ lead mới được tự chuyển; manager+ luôn được phép.
  const isOwner = !!user?.id && lead.assignedUser?.id === user.id;
  const canTransfer = isOwner || isManager;

  const [assignOpen, setAssignOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [transferType, setTransferType] = useState('');
  const [transferDeptId, setTransferDeptId] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState<string>(lead.labelId ?? '__NONE__');
  const assignAction = useFormAction({ successMessage: 'Đã phân lead' });
  const claimAction = useFormAction({ successMessage: 'Đã nhận lead' });
  const transferAction = useFormAction({ successMessage: 'Đã chuyển lead' });
  const statusAction = useFormAction({ successMessage: 'Đã đổi trạng thái' });
  const deleteAction = useFormAction({ successMessage: 'Đã xóa lead' });
  const labelAction = useFormAction({ successMessage: 'Đã gắn nhãn' });

  const canClaim = ['POOL', 'ZOOM', 'FLOATING'].includes(lead.status);

  // Manager+ có thể phân lead chưa chủ (POOL/ZOOM/FLOATING) lẫn phân lại lead đang có chủ (ASSIGNED/IN_PROGRESS).
  const canAssign = isManager && ['POOL', 'ZOOM', 'FLOATING', 'ASSIGNED', 'IN_PROGRESS'].includes(lead.status);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Claim */}
      {canClaim && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="outline"><UserPlus className="h-4 w-4 mr-1" />Nhận lead</Button>}
          title="Nhận lead"
          description="Bạn muốn nhận lead này về kho cá nhân?"
          confirmLabel="Nhận"
          onConfirm={() => claimAction.execute('post', `/leads/${lead.id}/claim`)}
          isLoading={claimAction.isLoading}
        />
      )}

      {/* Assign */}
      {canAssign && (
        <>
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" />Phân lead
          </Button>
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Phân lead cho nhân viên</DialogTitle></DialogHeader>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignOpen(false)}>Hủy</Button>
                <Button
                  disabled={!selectedUserId || assignAction.isLoading}
                  onClick={async () => {
                    const r = await assignAction.execute('post', `/leads/${lead.id}/assign`, { userId: selectedUserId });
                    if (r) setAssignOpen(false);
                  }}
                >
                  {assignAction.isLoading ? 'Đang xử lý...' : 'Phân'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Transfer - chỉ người đang giữ lead hoặc manager+ */}
      {canTransfer && (
        <>
          <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-1" />Chuyển
          </Button>
          <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Chuyển lead</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Select value={transferType} onValueChange={setTransferType}>
                  <SelectTrigger><SelectValue placeholder="Chọn hình thức" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEPARTMENT">Về phòng ban</SelectItem>
                    <SelectItem value="FLOATING">Thả nổi</SelectItem>
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
                    const r = await transferAction.execute('post', `/leads/${lead.id}/transfer`, body);
                    if (r) setTransferOpen(false);
                  }}
                >
                  {transferAction.isLoading ? 'Đang xử lý...' : 'Chuyển'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Change Status - chỉ manager+ */}
      {isManager && (
        <>
      <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>Đổi trạng thái</Button>
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Đổi trạng thái lead</DialogTitle></DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="POOL">Pool</SelectItem>
              <SelectItem value="ASSIGNED">Đã phân</SelectItem>
              <SelectItem value="IN_PROGRESS">Đang xử lý</SelectItem>
              <SelectItem value="CONVERTED">Đã chuyển đổi</SelectItem>
              <SelectItem value="LOST">Mất</SelectItem>
              <SelectItem value="FLOATING">Thả nổi</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Hủy</Button>
            <Button
              disabled={!newStatus || statusAction.isLoading}
              onClick={async () => {
                const r = await statusAction.execute('post', `/leads/${lead.id}/status`, { status: newStatus });
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

      {/* Single Label */}
      <Button size="sm" variant="outline" onClick={() => setLabelOpen(true)}>
        <Tag className="h-4 w-4 mr-1" />Nhãn
      </Button>
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gắn nhãn (1 nhãn / lead)</DialogTitle></DialogHeader>
          <Select value={selectedLabelId} onValueChange={setSelectedLabelId}>
            <SelectTrigger><SelectValue placeholder="Chưa có nhãn" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__NONE__">- Bỏ nhãn -</SelectItem>
              {labels.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelOpen(false)}>Hủy</Button>
            <Button
              disabled={labelAction.isLoading}
              onClick={async () => {
                const labelId = selectedLabelId === '__NONE__' ? null : selectedLabelId;
                const r = await labelAction.execute('patch', `/leads/${lead.id}/label`, { labelId });
                if (r) setLabelOpen(false);
              }}
            >
              {labelAction.isLoading ? 'Đang xử lý...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note */}
      <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
        <MessageSquarePlus className="h-4 w-4 mr-1" />Ghi chú
      </Button>
      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        entityType="lead"
        entityId={lead.id}
      />

      {/* Delete */}
      {isManager && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" />Xóa</Button>}
          title="Xóa lead"
          description={`Bạn có chắc muốn xóa lead "${lead.name}"?`}
          confirmLabel="Xóa"
          onConfirm={() => deleteAction.execute('delete', `/leads/${lead.id}`)}
          isLoading={deleteAction.isLoading}
        />
      )}
    </div>
  );
}
