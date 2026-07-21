import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import type { CustomerTier } from '@/types/entities';
import { CustomerTiersClient } from './customer-tiers-client';

/**
 * Admin Tier Config page - SUPER_ADMIN only.
 * Role guard ở 3 lớp: server (redirect), client (hide menu), API (@Roles).
 */
export default async function CustomerTiersSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let tiers: CustomerTier[] = [];
  try {
    tiers = await serverFetch<{ data: CustomerTier[] }>('/customer-tiers').then((r) => r.data);
  } catch {
    // Empty list - client sẽ hiển thị empty state
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Hạng khách hàng</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cấu hình ngưỡng chi tiêu để phân hạng KH. Đổi ngưỡng sẽ trigger recalc cho toàn bộ KH (chạy nền).
        </p>
      </header>
      <CustomerTiersClient initialTiers={tiers} />
    </div>
  );
}
