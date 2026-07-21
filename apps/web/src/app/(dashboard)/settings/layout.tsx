import { SettingsSidebar } from '@/components/settings/settings-sidebar';

/**
 * Layout chung cho mọi trang con /settings/* - header + sidebar điều hướng.
 * Mỗi mục là route riêng (lazy load), nội dung render ở {children}.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Cài đặt</h1>
      <p className="text-sm text-slate-500 mb-6">Quản lý cấu hình hệ thống</p>

      <div className="flex flex-col md:flex-row gap-6 min-h-[60vh]">
        <SettingsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
