'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Upload, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UserPhoneRecord, UserRecord } from '@/types/entities';
import { UserPhoneTable } from './user-phone-table';
import { UserPhoneCreateDialog } from './user-phone-create-dialog';
import { UserPhoneBulkDialog } from './user-phone-bulk-dialog';

interface Props {
  phones: UserPhoneRecord[];
  users: UserRecord[];
  nextCursor?: string;
  activeFilter: { userId?: string; phone?: string };
}

export function UserPhonesClient({ phones, users, nextCursor, activeFilter }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [openCreate, setOpenCreate] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);

  const [phoneSearch, setPhoneSearch] = useState(activeFilter.phone ?? '');
  const [userFilter, setUserFilter] = useState(activeFilter.userId ?? '__all__');

  // Debounce phone search
  useEffect(() => {
    const t = setTimeout(() => {
      const current = activeFilter.phone ?? '';
      if (phoneSearch === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (phoneSearch) params.set('phone', phoneSearch);
      else params.delete('phone');
      params.delete('cursor');
      startTransition(() => router.push(`?${params.toString()}`));
    }, 300);
    return () => clearTimeout(t);
  }, [phoneSearch]);

  function applyUserFilter(value: string) {
    setUserFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== '__all__') params.set('userId', value);
    else params.delete('userId');
    params.delete('cursor');
    startTransition(() => router.push(`?${params.toString()}`));
  }

  function resetFilters() {
    setPhoneSearch('');
    setUserFilter('__all__');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('phone');
    params.delete('userId');
    params.delete('cursor');
    startTransition(() => router.push(`?${params.toString()}`));
  }

  function nextPage() {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('cursor', nextCursor);
    startTransition(() => router.push(`?${params.toString()}`));
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
              placeholder="Tìm theo SĐT..."
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-56">
            <Select value={userFilter} onValueChange={applyUserFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Lọc theo nhân viên" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tất cả nhân viên</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}{u.department?.name ? ` - ${u.department.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(activeFilter.phone || activeFilter.userId) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4 mr-1" />
              Bỏ lọc
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenBulk(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Nhập hàng loạt
          </Button>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm SĐT
          </Button>
        </div>
      </div>

      <UserPhoneTable phones={phones} users={users} />

      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={nextPage}>
            Tải thêm
          </Button>
        </div>
      )}

      <UserPhoneCreateDialog open={openCreate} onOpenChange={setOpenCreate} users={users} />
      <UserPhoneBulkDialog open={openBulk} onOpenChange={setOpenBulk} users={users} />
    </div>
  );
}
