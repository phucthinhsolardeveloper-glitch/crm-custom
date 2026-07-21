import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import type { UserPhoneRecord, UserRecord, ApiListResponse } from '@/types/entities';
import { UserPhonesClient } from '@/components/user-phones/user-phones-client';

/** Trang phân SĐT cho nhân viên - SUPER_ADMIN only. */
export default async function UserPhonesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const qp = new URLSearchParams();
  if (params.userId) qp.set('userId', params.userId);
  if (params.phone) qp.set('phone', params.phone);
  if (params.cursor) qp.set('cursor', params.cursor);
  qp.set('limit', params.limit || '20');

  let phones: UserPhoneRecord[] = [];
  let nextCursor: string | undefined;
  try {
    const res = await serverFetch<ApiListResponse<UserPhoneRecord>>(
      `/admin/user-phones?${qp.toString()}`,
    );
    phones = res.data;
    nextCursor = res.meta?.nextCursor;
  } catch { /* empty */ }

  let users: UserRecord[] = [];
  try {
    const res = await serverFetch<ApiListResponse<UserRecord>>(
      '/users?limit=500',
    );
    users = res.data;
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Phân SĐT cho nhân viên</h1>
          <p className="text-sm text-slate-500">
            Mỗi cuộc gọi đến số trong danh sách sẽ ghi nhận cho nhân viên tương ứng.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <UserPhonesClient
          phones={phones}
          users={users}
          nextCursor={nextCursor}
          activeFilter={{ userId: params.userId, phone: params.phone }}
        />
      </div>
    </div>
  );
}
