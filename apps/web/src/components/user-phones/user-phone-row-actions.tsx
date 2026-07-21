'use client';

import { useState } from 'react';
import { MoreHorizontal, ArrowRightLeft, History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import type { UserPhoneRecord, UserRecord } from '@/types/entities';
import { UserPhoneTransferDialog } from './user-phone-transfer-dialog';
import { UserPhoneHistoryDialog } from './user-phone-history-dialog';

interface Props {
  phone: UserPhoneRecord;
  users: UserRecord[];
}

export function UserPhoneRowActions({ phone, users }: Props) {
  const [openTransfer, setOpenTransfer] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const { execute, isLoading } = useFormAction({ successMessage: 'Đã xóa SĐT phân' });

  async function handleDelete() {
    await execute('delete', `/admin/user-phones/${phone.id}`);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpenTransfer(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Chuyển nhân viên
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenHistory(true)}>
            <History className="h-4 w-4 mr-2" />
            Xem lịch sử
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDialog
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-700">
                <Trash2 className="h-4 w-4 mr-2" />
                Xóa
              </DropdownMenuItem>
            }
            title="Xóa SĐT phân?"
            description={`SĐT ${phone.phone} sẽ bị gỡ khỏi nhân viên ${phone.user?.name ?? ''}. Lịch sử vẫn được lưu.`}
            confirmLabel="Xóa"
            isLoading={isLoading}
            onConfirm={handleDelete}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <UserPhoneTransferDialog
        open={openTransfer}
        onOpenChange={setOpenTransfer}
        phone={phone}
        users={users}
      />
      <UserPhoneHistoryDialog
        open={openHistory}
        onOpenChange={setOpenHistory}
        phoneId={phone.id}
        phoneNumber={phone.phone}
      />
    </>
  );
}
