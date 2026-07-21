'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

interface KhoTab {
  key: string;
  label: string;
  /** URL params áp khi chọn tab (ghi đè status + assignment, giữ filter khác). */
  params: { status?: string; assignment?: string };
}

// Manager+ thấy đủ 3 kho + view "Đã phân". USER chỉ thấy kho mình được claim
// (Kho phòng ban + Thả nổi) + leads của mình (backend tự self-scope khi không filter).
const MANAGER_TABS: KhoTab[] = [
  { key: 'all', label: 'Tất cả', params: {} },
  { key: 'new', label: 'Kho Mới', params: { status: 'POOL', assignment: 'unassigned' } },
  { key: 'dept', label: 'Kho PB', params: { status: 'POOL', assignment: 'dept' } },
  { key: 'floating', label: 'Thả nổi', params: { status: 'FLOATING' } },
  { key: 'assigned', label: 'Đã phân', params: { assignment: 'user' } },
];
const USER_TABS: KhoTab[] = [
  { key: 'all', label: 'Của tôi', params: {} },
  { key: 'dept', label: 'Kho PB', params: { status: 'POOL' } },
  { key: 'floating', label: 'Thả nổi', params: { status: 'FLOATING' } },
];

/**
 * Tab kho scroll ngang cho mobile leads - filter nhanh 1 chạm thay vì phải mở
 * panel "Bộ lọc" rồi chọn dropdown. Chỉ ghi đè cặp param `status` + `assignment`
 * trên URL (giữ nguyên labelId/search/sort...), xóa cursor để về trang 1.
 *
 * Active tab derive từ URL hiện tại - không giữ state riêng (URL-based filter,
 * shareable link theo chuẩn dự án).
 */
export function LeadMobileKhoTabs({ userRole }: { userRole: UserRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabs = userRole === 'USER' ? USER_TABS : MANAGER_TABS;

  // Signature status+assignment hiện tại để so khớp active tab.
  const curStatus = searchParams.getAll('status').join(',');
  const curAssignment = searchParams.get('assignment') || '';
  const activeKey = tabs.find((t) =>
    (t.params.status || '') === curStatus && (t.params.assignment || '') === curAssignment,
  )?.key;

  function selectTab(tab: KhoTab) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('status');
    next.delete('assignment');
    next.delete('cursor');
    next.delete('page');
    if (tab.params.status) next.set('status', tab.params.status);
    if (tab.params.assignment) next.set('assignment', tab.params.assignment);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    // flex-shrink-0: LeadsLayoutShell là flex-col h-full - không có shrink-0 thì
    // hàng tab bị nén về 0 khi list dài, dải nút bên dưới đè lên (bug 2026-07-07).
    <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto px-0.5 py-1 scrollbar-none">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => selectTab(t)}
          className={cn(
            'flex-shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
            activeKey === t.key
              ? 'border-transparent bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md'
              : 'border-slate-200 bg-white text-slate-500 hover:border-sky-300',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
