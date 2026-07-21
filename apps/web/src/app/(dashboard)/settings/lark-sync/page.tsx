import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import type { LarkMappingItem, LarkCatalogEntry, LarkPreset } from './lark-sync-client';
import { LarkSyncTabs } from './lark-sync-tabs';

/**
 * Trang cau hinh dong bo payment -> Lark Base. SUPER_ADMIN only.
 * Role guard 3 lop: server (redirect), client (hide menu), API (@Roles).
 */
export default async function LarkSyncSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    redirect('/settings');
  }

  let mappings: LarkMappingItem[] = [];
  let catalog: LarkCatalogEntry[] = [];
  let presets: LarkPreset[] = [];

  try {
    [mappings, catalog, presets] = await Promise.all([
      serverFetch<{ data: LarkMappingItem[] }>('/lark-sync/mappings').then((r) => r.data),
      serverFetch<{ data: LarkCatalogEntry[] }>('/lark-sync/catalog').then((r) => r.data),
      serverFetch<{ data: LarkPreset[] }>('/lark-sync/presets').then((r) => r.data),
    ]);
  } catch {
    // Empty state - client hien thi danh sach trong
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Đồng bộ Lark Base</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mỗi Lark Sync trỏ tới 1 bảng Lark. Khi tạo đơn, nhân viên chọn Lark Sync để payment
          tự đẩy 1 dòng sang bảng tương ứng (chạy nền). Thêm bảng mới chỉ cần thêm Lark Sync, không cần sửa code.
        </p>
      </header>
      <LarkSyncTabs
        initialMappings={mappings}
        catalog={catalog}
        presets={presets}
      />
    </div>
  );
}
