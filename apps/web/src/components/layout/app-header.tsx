'use client';

import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { LogOut, User, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/layout/search-bar';
import { NotificationBell } from '@/components/layout/notification-bell';
import { CallStatusIndicator } from '@/components/call/call-status-indicator';
import { FontPickerMenu } from '@/components/layout/font-picker-menu';
import { useMobileSidebar } from '@/components/layout/mobile-sidebar-provider';

export function AppHeader() {
  const { user, logout } = useAuth();
  const { toggle } = useMobileSidebar();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200/80 bg-white px-2 sm:px-3">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={toggle}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors lg:hidden"
          aria-label="Menu"
        >
          <Menu size={20} />
        </button>
        <SearchBar />
      </div>

      {/* User menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        <CallStatusIndicator />
        <FontPickerMenu />
        <NotificationBell />
        <Link href="/profile" className="flex items-center gap-2 text-sm rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-50 transition-colors" title="Thông tin cá nhân">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_2px_8px_-2px_rgba(14,165,233,0.4)]">
            <User size={16} />
          </div>
          <div className="hidden sm:block">
            <div className="font-semibold text-slate-700">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.role === 'SUPER_ADMIN' ? 'Quản trị viên' : user?.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'}</div>
          </div>
        </Link>
        <Button variant="ghost" size="icon" onClick={logout} title="Đăng xuất">
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  );
}
