'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormAction } from '@/hooks/use-form-action';
import type { UserPhoneRecord, UserRecord } from '@/types/entities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: UserPhoneRecord;
  users: UserRecord[];
}

export function UserPhoneTransferDialog({ open, onOpenChange, phone, users }: Props) {
  const [newUserId, setNewUserId] = useState('');
  const [note, setNote] = useState('');
  const { execute, isLoading } = useFormAction({
    successMessage: 'Đã chuyển SĐT',
    onSuccess: () => {
      setNewUserId('');
      setNote('');
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) {
      setNewUserId('');
      setNote('');
    }
  }, [open]);

  async function submit() {
    if (!newUserId) return;
    await execute('patch', `/admin/user-phones/${phone.id}/transfer`, {
      newUserId,
      note: note || undefined,
    });
  }

  const eligibleUsers = users.filter((u) => String(u.id) !== phone.userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chuyển SĐT cho nhân viên khác</DialogTitle>
          <DialogDescription>
            SĐT <span className="font-mono">{phone.phone}</span> đang thuộc{' '}
            <span className="font-medium">{phone.user?.name ?? '-'}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="newUserId">Chuyển sang</Label>
            <Select value={newUserId} onValueChange={setNewUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhân viên đích..." />
              </SelectTrigger>
              <SelectContent>
                {eligibleUsers.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}{u.department?.name ? ` - ${u.department.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="transferNote">Ghi chú (tùy chọn)</Label>
            <Textarea
              id="transferNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Lý do chuyển..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={isLoading || !newUserId}>
            {isLoading ? 'Đang xử lý...' : 'Chuyển'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
