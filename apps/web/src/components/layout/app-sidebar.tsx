'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, ShoppingCart, Package,
  Phone, Settings, Upload, ChevronLeft, ChevronRight, ChevronDown,
  UserCog, CheckSquare, Zap, CreditCard, X,
  BarChart3, DollarSign, UsersRound, Activity, PhoneOutgoing,
  Inbox, Waves, User as UserIcon, Funnel, Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useState, useEffect, useMemo } from 'react';
import { useMobileSidebar } from '@/components/layout/mobile-sidebar-provider';

interface NavChild {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
  /** Static children (role-filtered via child.roles) */
  children?: NavChild[];
  /** Role-specific children (legacy pattern for Leads) */
  childRoles?: string[];
  childrenByRole?: Record<string, NavChild[]>;
}

interface NavGroup {
  /** Section header text (hidden khi sidebar collapsed). */
  label: string;
  items: NavItem[];
}

/**
 * Sub-menu cho mục Leads - 2 bộ theo role:
 *
 * USER: deep-link vào /leads với query filter (BE filter status + scope).
 *   /leads?assignedUserId=<self>  -> Của tôi (lead đang assigned cho mình)
 *   /leads?status=POOL            -> Kho phòng ban (BE: status=POOL + dept=user.dept + assignedUserId=null)
 *   /leads?status=FLOATING        -> Kho thả nổi (BE: status=FLOATING)
 *
 * MANAGER/SUPER_ADMIN: 4 trang kho dedicated + trang Tất cả (unified /leads).
 * URL kho SẠCH (không query) - điều kiện scope fix cứng trong code
 * (kho-config.ts baseParams). Active match: pathname riêng -> exact match tự đúng.
 *
 * LEADER: không match role nào -> flat Leads link (giữ nguyên).
 *
 * "Của tôi" cần user.id runtime (BE không có shortcut "me") nên build trong
 * component thay vì module-level constant.
 */
function buildLeadsChildren(userId: string | undefined): NavChild[] {
  if (!userId) return [];
  const managerRoles = ['MANAGER', 'SUPER_ADMIN'];
  return [
    { label: 'Của tôi', href: `/leads?assignedUserId=${userId}`, icon: UserIcon, roles: ['USER'] },
    { label: 'Kho phòng ban', href: '/leads?status=POOL', icon: Inbox, roles: ['USER'] },
    { label: 'Kho thả nổi', href: '/leads?status=FLOATING', icon: Waves, roles: ['USER'] },
    { label: 'Tất cả', href: '/leads', icon: Users, roles: managerRoles },
    { label: 'Kho Mới', href: '/leads/pool', icon: Inbox, roles: managerRoles },
    { label: 'Kho Zoom', href: '/leads/zoom', icon: Funnel, roles: managerRoles },
    { label: 'Kho Thả Nổi', href: '/leads/floating', icon: Waves, roles: managerRoles },
  ];
}

/**
 * Sidebar gom 3 nhóm theo workflow:
 * - KINH DOANH: thao tác hằng ngày, mọi role.
 * - VẬN HÀNH: phân phối, đối soát, import data, cấu hình - MGR+.
 * - HỆ THỐNG: quản lý nội bộ - SA only.
 *
 * RBAC giữ nguyên qua field `roles` mỗi item - role không có item nào trong group
 * sẽ ẩn cả section header.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'KINH DOANH',
    items: [
      {
        label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard,
        children: [
          { label: 'Tổng quát', href: '/dashboard', icon: BarChart3 },
          { label: 'Doanh thu', href: '/dashboard/revenue', icon: DollarSign },
          { label: 'Nhân viên', href: '/dashboard/employees', icon: UsersRound, roles: ['SUPER_ADMIN', 'MANAGER'] },
        ],
      },
      // Leads - sub-menu theo role (xem buildLeadsChildren): USER = 3 shortcut
      // filter trên /leads; MANAGER+ = Tất cả + 4 trang kho dedicated; LEADER = flat.
      // children inject runtime trong component (cần user.id cho "Của tôi").
      { label: 'Leads', href: '/leads', icon: Users },
      { label: 'Khách hàng', href: '/customers', icon: UserCheck },
      { label: 'Đơn hàng', href: '/orders', icon: ShoppingCart },
      // Hoàn tiền - bảng nhập tay, mọi role thấy (backend self-scope theo người tạo).
      { label: 'Hoàn tiền', href: '/refunds', icon: Undo2 },
      { label: 'Sản phẩm', href: '/products', icon: Package },
      // Mo cho moi role - backend scope: USER cuoc cua minh, LEADER cuoc team, MANAGER+ tat ca.
      { label: 'Cuộc gọi', href: '/call-logs', icon: Phone },
      { label: 'Công việc', href: '/tasks', icon: CheckSquare },
      // Trang giám sát đội cho LEADER (member + KPI). MANAGER/SUPER_ADMIN cũng xem được.
      { label: 'Team của tôi', href: '/my-team', icon: UsersRound, roles: ['LEADER', 'MANAGER', 'SUPER_ADMIN'] },
    ],
  },
  {
    label: 'VẬN HÀNH',
    items: [
      { label: 'Phân phối AI', href: '/settings/distribution', icon: Zap, roles: ['SUPER_ADMIN', 'MANAGER'] },
      { label: 'Đối soát CK', href: '/payments', icon: CreditCard, roles: ['SUPER_ADMIN', 'MANAGER'] },
      { label: 'Nhập dữ liệu', href: '/import', icon: Upload, roles: ['SUPER_ADMIN', 'MANAGER'] },
      // Quan ly NV la business op cua MANAGER (nhu Team CRUD) -> thuoc VAN HANH,
      // khong nam o HE THONG (nhom do toan item SUPER_ADMIN only).
      { label: 'Quản lý NV', href: '/users', icon: UserCog, roles: ['SUPER_ADMIN', 'MANAGER'] },
      { label: 'Cài đặt', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'MANAGER'] },
    ],
  },
  {
    label: 'HỆ THỐNG',
    items: [
      { label: 'Phân SĐT', href: '/user-phones', icon: PhoneOutgoing, roles: ['SUPER_ADMIN'] },
      { label: 'Nhật ký hệ thống', href: '/trace', icon: Activity, roles: ['SUPER_ADMIN'] },
    ],
  },
];

// Paths that belong to collapsible groups
// '/dashboard/customers' van la route hop le (deep link); chi an khoi menu sidebar
const DASHBOARD_CHILD_PATHS = ['/dashboard', '/dashboard/revenue', '/dashboard/employees', '/dashboard/customers'];

// Mọi sub-link của Leads đều cùng pathname /leads, khác nhau ở query string.
// Active state dựa trên pathname start với /leads (kể cả /leads/[id], /leads/new).
const LEADS_PATH_PREFIX = '/leads';

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { open: mobileOpen, close: closeMobile } = useMobileSidebar();
  // Persist trang thai thu gon qua localStorage - init false de SSR/client khop
  // nhau (tranh hydration mismatch), sync gia tri luu o effect sau mount.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === '1') setCollapsed(true);
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', prev ? '0' : '1');
      return !prev;
    });
  }

  const isDashboardActive = DASHBOARD_CHILD_PATHS.some(p => pathname === p || (p !== '/dashboard' && pathname.startsWith(p)));
  const isLeadsActive = pathname === LEADS_PATH_PREFIX || pathname.startsWith(LEADS_PATH_PREFIX + '/');

  const [dashboardOpen, setDashboardOpen] = useState(isDashboardActive);
  const [leadsOpen, setLeadsOpen] = useState(isLeadsActive);

  // Build sub-menu Leads runtime - cần user.id cho href "Của tôi".
  const leadsChildren = useMemo(() => buildLeadsChildren(user?.id), [user?.id]);

  useEffect(() => { closeMobile(); }, [pathname, closeMobile]);

  const role = user?.role || '';
  // Filter items theo role -> drop group rỗng. Đảm bảo USER không thấy section
  // header trống của VẬN HÀNH/HỆ THỐNG.
  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return user && item.roles.includes(user.role);
    }),
  })).filter((g) => g.items.length > 0);

  function renderNavLink(item: { label: string; href: string; icon: React.ElementType }, indent = false) {
    const [itemPath, itemQuery = ''] = item.href.split('?');
    const isLeadsSubItem = indent && itemPath === LEADS_PATH_PREFIX;
    // Sub-link của Leads: cùng pathname, discriminate qua FULL query match.
    // Mọi key trong itemHref phải có value tương đương ở current searchParams.
    // Cho phép current có thêm key khác (vd ?page=2) mà vẫn match - chỉ cần
    // các key filter cốt lõi (status / assignedUserId) khớp.
    let isExactMatch = pathname === itemPath;
    if (isLeadsSubItem) {
      const itemParams = new URLSearchParams(itemQuery);
      const allMatch = Array.from(itemParams.entries()).every(
        ([k, v]) => (searchParams?.get(k) ?? '') === v,
      );
      isExactMatch = pathname === itemPath && allMatch;
    }
    // Parent "Leads" top-level dùng href '/leads' không có query - tránh false-active
    // khi user đang ở sub-link. Logic exact match đã đủ; prefix match ẩn cho /leads
    // (giữ nguyên hành vi cũ) và /dashboard.
    const isPrefixMatch = !indent && itemPath !== '/dashboard' && itemPath !== '/leads' && pathname.startsWith(itemPath);
    const active = isExactMatch || isPrefixMatch;
    const showLabel = mobileOpen || !collapsed;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'group relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-all duration-200',
          active
            ? 'bg-sky-50 text-sky-600 shadow-[0_2px_8px_-2px_rgba(14,165,233,0.15)]'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          !mobileOpen && collapsed && 'justify-center px-2',
          indent && showLabel && 'pl-8',
        )}
        title={!showLabel ? item.label : undefined}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sky-500 to-cyan-500" />
        )}
        {/* Icon nhich nhe sang phai khi hover - micro-interaction */}
        <item.icon
          size={indent ? 16 : 18}
          className={cn('transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-110', active && 'text-sky-600')}
        />
        {showLabel && <span className="whitespace-nowrap">{item.label}</span>}
      </Link>
    );
  }

  /** Render a collapsible group (Dashboard or Leads) */
  function renderCollapsible(
    item: NavItem,
    children: NavChild[],
    isOpen: boolean,
    toggle: () => void,
    isGroupActive: boolean,
  ) {
    const showLabel = mobileOpen || !collapsed;
    if (!showLabel) return renderNavLink(item);

    return (
      <div key={item.href}>
        <button
          onClick={toggle}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-all duration-200',
            isGroupActive ? 'text-sky-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <item.icon size={18} />
          <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
          <ChevronDown size={14} className={cn('transition-transform duration-200', isOpen && 'rotate-180')} />
        </button>
        {/* Expand/collapse muot: grid-template-rows 0fr <-> 1fr (globals.css).
            Children luon mounted de transition chay ca 2 chieu. */}
        <div className={cn('submenu-collapse', isOpen && 'submenu-open')}>
          <div className="mt-0.5 space-y-0.5">
            {children.map(child => renderNavLink(child, true))}
          </div>
        </div>
      </div>
    );
  }

  const showLabel = mobileOpen || !collapsed;

  const navContent = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {visibleGroups.map((group, groupIdx) => (
        <div key={group.label}>
          {/* Section header - hiển thị khi expanded; collapsed thì thay bằng divider mỏng. */}
          {showLabel ? (
            <div className={cn(
              'px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400',
              groupIdx === 0 ? 'pt-1' : 'pt-3',
            )}>
              {group.label}
            </div>
          ) : (
            groupIdx > 0 && <div className="mx-2 my-2 border-t border-slate-200" />
          )}
          {group.items.map((item) => {
            // Inject children runtime cho Leads (cần user.id). Item khác dùng
            // children tĩnh từ NAV_GROUPS.
            const effectiveChildren = item.href === '/leads' ? leadsChildren : item.children;
            // Items có children -> render collapsible. Fallback về plain link khi
            // role hiện tại không có visible child nào (tránh nút dropdown rỗng).
            if (effectiveChildren && effectiveChildren.length > 0) {
              const visibleChildren = effectiveChildren.filter((c) => !c.roles || c.roles.includes(role));
              if (visibleChildren.length === 0) return renderNavLink(item);
              if (item.href === '/leads') {
                return renderCollapsible(item, visibleChildren, leadsOpen, () => setLeadsOpen(!leadsOpen), isLeadsActive);
              }
              return renderCollapsible(item, visibleChildren, dashboardOpen, () => setDashboardOpen(!dashboardOpen), isDashboardActive);
            }
            return renderNavLink(item);
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col border-r border-slate-200/80 bg-white transition-all duration-200',
        // w-44 (176px) bóp sát: icon 18px + gap 10px + chữ dài nhất "Phân tích cuộc gọi" ~140px + padding-x 16px ≈ 175px.
        // Tổng còn dư ~1px sát cạnh phải - đúng wireframe 2026-05-23. Nếu chữ overflow sau khi thêm i18n
        // dài hơn, tăng lại lên w-48 hoặc dùng truncate.
        collapsed ? 'w-16' : 'w-44',
      )}>
        <div className="flex h-14 items-center justify-between border-b border-slate-200/80 px-4">
          {!collapsed && <span className="text-lg font-extrabold text-gradient">CRM-Custom</span>}
          <button
            onClick={toggleCollapsed}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        {navContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeMobile} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex h-14 items-center justify-between border-b border-slate-200/80 px-4">
              <span className="text-lg font-extrabold text-gradient">CRM-Custom</span>
              <button
                onClick={closeMobile}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
