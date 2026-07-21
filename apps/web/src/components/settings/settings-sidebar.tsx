'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import {
  Building2, GraduationCap, Megaphone, Tag, Tags, Crown,
  CreditCard, Repeat, FileText, Layers, Landmark,
  Key, Bot, ChevronDown, Webhook, CloudUpload, Share2, LayoutList, TextCursorInput,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  /** Route segment - link đích là `/settings/<id>`. */
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  managerOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Tổ chức',
    items: [
      { id: 'departments', label: 'Phòng ban & Team', icon: Building2 },
      { id: 'levels', label: 'Cấp bậc', icon: GraduationCap },
    ],
  },
  {
    title: 'Lead & Khách hàng',
    items: [
      { id: 'sources', label: 'Nguồn lead', icon: Megaphone },
      { id: 'labels', label: 'Nhãn', icon: Tag, managerOnly: true },
      { id: 'label-visibility', label: 'Nhãn theo phòng ban', icon: Tags, adminOnly: true },
      { id: 'lead-table-views', label: 'Bố cục bảng theo phòng ban', icon: LayoutList, adminOnly: true },
      { id: 'lead-custom-fields', label: 'Trường tùy chỉnh lead', icon: TextCursorInput, adminOnly: true },
      { id: 'distribution', label: 'Phân phối Leads', icon: Share2, managerOnly: true },
      { id: 'customer-tiers', label: 'Hạng khách hàng', icon: Crown, adminOnly: true },
    ],
  },
  {
    title: 'Đơn hàng & Thanh toán',
    items: [
      { id: 'payment-types', label: 'Loại thanh toán', icon: CreditCard },
      { id: 'payment-installments', label: 'Lần chuyển khoản', icon: Repeat },
      { id: 'order-formats', label: 'Hình thức đơn hàng', icon: FileText },
      { id: 'product-groups', label: 'Nhóm sản phẩm', icon: Layers },
      { id: 'bank-accounts', label: 'Tài khoản ngân hàng', icon: Landmark },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { id: 'api-keys', label: 'API Keys', icon: Key, adminOnly: true },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook, adminOnly: true },
      { id: 'ai', label: 'AI Cấu hình', icon: Bot, adminOnly: true },
      { id: 'lark-sync', label: 'Đồng bộ Lark', icon: CloudUpload, adminOnly: true },
    ],
  },
];

/** Sidebar điều hướng Settings - mỗi mục là route riêng, active theo URL hiện tại. */
export function SettingsSidebar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  const pathname = usePathname();
  const router = useRouter();

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(NAV_GROUPS.map(g => g.title)),
  );

  function toggleGroup(title: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function isVisible(item: NavItem) {
    if (item.adminOnly && !isAdmin) return false;
    if (item.managerOnly && !isAdmin && !isManager) return false;
    return true;
  }

  const hrefOf = (id: string) => `/settings/${id}`;
  const isActive = (id: string) => pathname === hrefOf(id);

  const visibleItems = NAV_GROUPS.flatMap(g => g.items).filter(isVisible);
  const currentId = visibleItems.find(i => isActive(i.id))?.id ?? '';

  return (
    <>
      {/* Sidebar nav - desktop */}
      <nav className="hidden md:block w-56 shrink-0 space-y-1">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(isVisible);
          if (items.length === 0) return null;
          const isExpanded = expandedGroups.has(group.title);

          return (
            <div key={group.title} className="mb-2">
              <button
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
              >
                {group.title}
                <ChevronDown size={14} className={cn('transition-transform', isExpanded && 'rotate-180')} />
              </button>
              {isExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={hrefOf(item.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                        isActive(item.id)
                          ? 'bg-sky-50 text-sky-600'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <item.icon size={16} className={cn(isActive(item.id) ? 'text-sky-500' : 'text-slate-400')} />
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Mobile select dropdown */}
      <div className="md:hidden w-full mb-4">
        <select
          value={currentId}
          onChange={(e) => router.push(hrefOf(e.target.value))}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700"
        >
          {visibleItems.map(item => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>
    </>
  );
}
