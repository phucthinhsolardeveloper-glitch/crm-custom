'use client';

import { useEffect, useState } from 'react';
import { Plus, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPhoneDisplay } from '@crm/utils';
import { userPhonesApi } from '@/lib/api/user-phones';
import type { UserPhoneRecord, UserRecord } from '@/types/entities';
import { UserPhoneCreateDialog } from './user-phone-create-dialog';
import { UserPhoneRowActions } from './user-phone-row-actions';

interface Props {
  userId: string;
  userName: string;
  /** Danh sách users để dùng cho transfer dialog (optional - lazy load nếu rỗng). */
  allUsers: UserRecord[];
}

/** Panel quản lý SĐT phụ trách của 1 user - dùng trong /users/[id]/edit. */
export function UserPhonesPanel({ userId, userName, allUsers }: Props) {
  const [phones, setPhones] = useState<UserPhoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await userPhonesApi.listByUser(userId);
      setPhones(res.data);
    } catch {
      setPhones([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [userId]);

  // Reload khi đóng dialog create (hiển thị số mới ngay)
  useEffect(() => {
    if (!openCreate) load();
  }, [openCreate]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SĐT phụ trách</h2>
          <p className="text-sm text-slate-500">
            Cuộc gọi đến số trong danh sách sẽ ghi nhận hoạt động cho {userName}.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Thêm SĐT
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Đang tải...
        </div>
      ) : phones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <Phone className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Chưa phân SĐT nào cho nhân viên này</p>
          <Button variant="outline" size="sm" onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm SĐT đầu tiên
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-500">Số điện thoại</th>
                <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Ngày phân</th>
                <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-slate-500">Người phân</th>
                <th className="hidden xl:table-cell px-4 py-3 text-left font-medium text-slate-500">Ghi chú</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {phones.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-900">{formatPhoneDisplay(p.phone)}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-600">
                    {new Date(p.assignedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-slate-600">{p.assigner?.name ?? '-'}</td>
                  <td className="hidden xl:table-cell px-4 py-3 text-slate-500 max-w-xs truncate">{p.note || ''}</td>
                  <td className="px-4 py-3 text-right">
                    <UserPhoneRowActions phone={p} users={allUsers} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserPhoneCreateDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        users={allUsers}
        defaultUserId={userId}
      />
    </div>
  );
}
