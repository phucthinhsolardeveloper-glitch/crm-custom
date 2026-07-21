'use client';

import { formatPhoneDisplay } from '@crm/utils';
import type { UserPhoneRecord, UserRecord } from '@/types/entities';
import { UserPhoneRowActions } from './user-phone-row-actions';

interface Props {
  phones: UserPhoneRecord[];
  users: UserRecord[];
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export function UserPhoneTable({ phones, users }: Props) {
  if (phones.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Chưa có SĐT nào được phân
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-left font-medium text-slate-500">Số điện thoại</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Nhân viên phụ trách</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Phòng ban</th>
            <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-slate-500">Ngày phân</th>
            <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-slate-500">Người phân</th>
            <th className="hidden xl:table-cell px-4 py-3 text-left font-medium text-slate-500">Ghi chú</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {phones.map((p) => (
            <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-slate-900">{formatPhoneDisplay(p.phone)}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{p.user?.name ?? '-'}</div>
                <div className="text-xs text-slate-500">{p.user?.email ?? ''}</div>
              </td>
              <td className="hidden md:table-cell px-4 py-3 text-slate-600">
                {p.user?.department?.name ?? '-'}
              </td>
              <td className="hidden lg:table-cell px-4 py-3 text-slate-600">
                {fmtDateTime(p.assignedAt)}
              </td>
              <td className="hidden lg:table-cell px-4 py-3 text-slate-600">
                {p.assigner?.name ?? '-'}
              </td>
              <td className="hidden xl:table-cell px-4 py-3 text-slate-500 max-w-xs truncate">
                {p.note || ''}
              </td>
              <td className="px-4 py-3 text-right">
                <UserPhoneRowActions phone={p} users={users} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
