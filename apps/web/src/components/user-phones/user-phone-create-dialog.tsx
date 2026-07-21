'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormAction } from '@/hooks/use-form-action';
import type { UserRecord } from '@/types/entities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserRecord[];
  defaultUserId?: string;
}

export function UserPhoneCreateDialog({ open, onOpenChange, users, defaultUserId }: Props) {
  const [phone, setPhone] = useState('');
  const [userId, setUserId] = useState(defaultUserId ?? '');
  const [note, setNote] = useState('');
  const { execute, isLoading } = useFormAction({
    successMessage: 'Đã phân SĐT cho nhân viên',
    onSuccess: () => {
      setPhone('');
      setNote('');
      if (!defaultUserId) setUserId('');
      onOpenChange(false);
    },
  });

  async function submit() {
    if (!phone.trim() || !userId) return;
    await execute('post', '/admin/user-phones', { phone: phone.trim(), userId, note: note || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Phân SĐT cho nhân viên</DialogTitle>
          <DialogDescription>SĐT phải chuẩn VN (10-11 chữ số, bắt đầu 0).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="userId">Nhân viên</Label>
            <Select value={userId} onValueChange={setUserId} disabled={Boolean(defaultUserId)}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhân viên..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}{u.department?.name ? ` - ${u.department.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="note">Ghi chú (tùy chọn)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={isLoading || !phone.trim() || !userId}>
            {isLoading ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
