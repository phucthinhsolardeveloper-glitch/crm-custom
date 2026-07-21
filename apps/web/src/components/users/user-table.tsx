'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BulkDeleteBar } from '@/components/shared/bulk-delete-bar';
import { useBulkSelection } from '@/hooks/use-bulk-selection';
import { useFormAction } from '@/hooks/use-form-action';
import { Pencil, UserX, Phone, PhoneOff } from 'lucide-react';
import type { UserRecord } from '@/types/entities';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Quản lý',
  LEADER: 'Trưởng nhóm',
  USER: 'Nhân viên',
};

// Mỗi vai trò 1 màu cố định để phân biệt nhanh.
const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-sky-100 text-sky-700',
  LEADER: 'bg-amber-100 text-amber-700',
  USER: 'bg-slate-100 text-slate-600',
};

// Bảng màu cho team. Mỗi team chọn 1 màu theo id -> cùng team luôn ra cùng màu.
// Dùng class đầy đủ (không ghép chuỗi) để Tailwind giữ lại khi build.
const TEAM_COLORS = [
  'bg-sky-50 text-sky-700',
  'bg-violet-50 text-violet-700',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-rose-50 text-rose-700',
  'bg-indigo-50 text-indigo-700',
  'bg-teal-50 text-teal-700',
  'bg-fuchsia-50 text-fuchsia-700',
];

/** Băm id team thành chỉ số màu cố định trong bảng TEAM_COLORS. */
function teamColorClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TEAM_COLORS[hash % TEAM_COLORS.length];
}

interface UserTableProps {
  users: UserRecord[];
  /** Bật bulk delete (cả SA lẫn MANAGER, nhưng MANAGER bị chặn ở row level). */
  enableBulkDelete?: boolean;
  /** Current user id - skip checkbox cho chính mình (không tự deactivate). */
  currentUserId?: string;
  /** Role current user - MANAGER không thao tác được trên row role MANAGER+. */
  currentUserRole?: string;
}

export function UserTable({
  users,
  enableBulkDelete = false,
  currentUserId,
  currentUserRole,
}: UserTableProps) {
  const { execute, isLoading } = useFormAction({ successMessage: 'Đã vô hiệu hóa nhân viên' });
  const isManagerActor = currentUserRole === 'MANAGER';
  // MANAGER chỉ thao tác được trên USER. Helper dùng cho cả checkbox lẫn nút edit/deactivate.
  const canActOn = (u: UserRecord) => !isManagerActor || u.role === 'USER';
  // Chỉ chọn được các user ACTIVE, không phải chính mình, và actor có quyền touch.
  const selectableUsers = users.filter(
    (u) => u.status === 'ACTIVE' && String(u.id) !== currentUserId && canActOn(u),
  );
  const sel = useBulkSelection(selectableUsers.map((u) => ({ id: String(u.id) })));

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {enableBulkDelete && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={sel.allSelected}
                    ref={(el) => { if (el) el.indeterminate = sel.someSelected; }}
                    onChange={sel.toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-slate-500">Nhân viên</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Email</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Vai trò</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Phòng ban</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">SIP</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Trạng thái</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={enableBulkDelete ? 8 : 7} className="px-4 py-8 text-center text-slate-400">Không có nhân viên nào</td></tr>
            ) : users.map((u) => {
              const idStr = String(u.id);
              const canManageRow = canActOn(u);
              const isSelectable = u.status === 'ACTIVE' && idStr !== currentUserId && canManageRow;
              const isSelected = sel.isSelected(idStr);
              return (
                <tr key={u.id} className={cn('border-b border-slate-50 hover:bg-slate-50', isSelected && 'bg-sky-50')}>
                  {enableBulkDelete && (
                    <td className="w-10 px-3 py-3">
                      {isSelectable ? (
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${u.name}`}
                          checked={isSelected}
                          onChange={() => sel.toggleOne(idStr)}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.name}</div>
                    {u.team?.name ? (
                      <span className={cn('mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium', teamColorClass(String(u.team.id)))}>
                        {u.team.name}
                      </span>
                    ) : (
                      <span className="mt-1 inline-block text-xs text-slate-400">Chưa có team</span>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', ROLE_STYLES[u.role] || 'bg-slate-100 text-slate-600')}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-600">{u.department?.name || '-'}</td>
                  <td className="px-4 py-3">
                    {u.sipConfig ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600" title="Đã gắn SIP">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="hidden text-xs font-medium sm:inline">Đã gắn</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400" title="Chưa gắn SIP">
                        <PhoneOff className="h-3.5 w-3.5" />
                        <span className="hidden text-xs sm:inline">Chưa gắn</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {u.status === 'ACTIVE' ? 'Hoạt động' : 'Vô hiệu hóa'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {canManageRow && (
                        <Link href={`/users/${u.id}/edit`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                        </Link>
                      )}
                      {canManageRow && u.status === 'ACTIVE' && (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <UserX className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          }
                          title="Vô hiệu hóa nhân viên"
                          description={`Bạn có chắc muốn vô hiệu hóa "${u.name}"? Leads/customers sẽ được chuyển về kho phòng ban.`}
                          confirmLabel="Vô hiệu hóa"
                          onConfirm={() => execute('delete', `/users/${u.id}`)}
                          isLoading={isLoading}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {enableBulkDelete && (
        <BulkDeleteBar
          count={sel.count}
          ids={sel.selectedIds}
          endpoint="/users/bulk-delete"
          entityLabel="người dùng"
          hint="Thao tác này sẽ vô hiệu hóa các nhân viên đã chọn. Leads/customers sẽ được chuyển về kho phòng ban."
          onClear={sel.clear}
        />
      )}
    </>
  );
}
