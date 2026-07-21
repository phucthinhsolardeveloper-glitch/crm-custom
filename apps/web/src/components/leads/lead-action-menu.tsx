'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, ShoppingCart, CalendarPlus, Info, Loader2, ArrowRightLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LeadEditDrawer } from '@/components/leads/lead-edit-drawer';
import { LeadQuickTaskDialog } from '@/components/leads/lead-quick-task-dialog';
import { LeadTransferSubmenu } from '@/components/leads/lead-transfer-submenu';
import { LeadCreateOrderFlow } from '@/components/leads/lead-create-order-flow';
import { api } from '@/lib/api-client';
import type { LeadRecord } from '@/types/entities';

type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

interface Props {
  leadId: string;
  /** Row data từ table - dùng để mở drawer instant + lấy customerId nếu lead đã CONVERTED. */
  lead?: Partial<LeadRecord>;
  /** Permission gate: MANAGER/SUPER_ADMIN mới thấy item "Chuyển phòng ban". */
  userRole?: UserRole;
}

const HOVER_CLOSE_DELAY_MS = 200;

/**
 * Pencil button trên table lead. Hover (hoặc click trên mobile) hiện menu 3 options:
 * - Tạo đơn đặt hàng: auto-convert lead -> customer (BE side) -> mở CreateOrderDialog
 * - Đặt lịch: mở LeadQuickTaskDialog gắn entityType=LEAD
 * - Thông tin: mở LeadEditDrawer (giữ behavior cũ của LeadEditButton)
 */
export function LeadActionMenu({ leadId, lead, userRole = 'USER' }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // menuMode: 'main' hiển thị các action chính, 'transfer' hiển thị submenu chuyển lead
  // (2026-05-23: replace dialog LeadTransferDepartmentDialog cũ - giờ là inline submenu).
  const [menuMode, setMenuMode] = useState<'main' | 'transfer'>('main');
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [orderCustomerId, setOrderCustomerId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  // userRole giữ lại cho future per-role gating, hiện tại không dùng vì BE đã guard.
  void userRole;

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setMenuOpen(false), HOVER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  const openMenu = useCallback(() => {
    cancelClose();
    setMenuOpen(true);
  }, [cancelClose]);

  function closeMenuImmediate() {
    cancelClose();
    setMenuOpen(false);
    // Reset menu mode khi đóng để lần mở tiếp theo về main view
    setMenuMode('main');
  }

  async function handleCreateOrder() {
    closeMenuImmediate();
    // Lead đã có customerId (CONVERTED hoặc shadow customer) -> dùng luôn, skip convert call.
    if (lead?.customerId) {
      setOrderCustomerId(lead.customerId);
      setFlowOpen(true);
      return;
    }
    setConverting(true);
    try {
      const res = await api.post<{ data: { customerId?: string | null } }>(`/leads/${leadId}/convert`);
      const cid = res.data?.customerId;
      if (!cid) throw new Error('Không lấy được customerId sau convert');
      setOrderCustomerId(cid);
      setFlowOpen(true);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi chuyển đổi lead');
    } finally {
      setConverting(false);
    }
  }

  function handleSchedule() {
    closeMenuImmediate();
    setTaskDialogOpen(true);
  }

  function handleInfo() {
    closeMenuImmediate();
    setEditDrawerOpen(true);
  }

  function handleOpenTransferSubmenu() {
    cancelClose();
    setMenuMode('transfer');
    // KHÔNG đóng popover - chỉ swap view sang submenu chuyển lead
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
            onClick={(e) => {
              // Chỉ chặn click lan ra card (long-press). KHÔNG tự toggle menuOpen
              // ở đây: Radix PopoverTrigger đã tự mở/đóng khi click. Nếu toggle
              // thêm 1 lần nữa -> double-toggle -> menu mở rồi đóng ngay trên touch.
              e.stopPropagation();
            }}
            disabled={converting}
            title="Thao tác lead"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-200 hover:bg-sky-100 hover:text-sky-700 hover:ring-sky-300 transition-colors disabled:opacity-50"
          >
            {converting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={4}
          className={menuMode === 'transfer' ? 'w-56 p-0' : 'w-48 p-1'}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          {menuMode === 'main' ? (
            <>
              <MenuItem icon={<ShoppingCart className="h-4 w-4" />} onClick={handleCreateOrder}>
                Tạo đơn đặt hàng
              </MenuItem>
              <MenuItem icon={<CalendarPlus className="h-4 w-4" />} onClick={handleSchedule}>
                Đặt lịch
              </MenuItem>
              <MenuItem icon={<Info className="h-4 w-4" />} onClick={handleInfo}>
                Thông tin
              </MenuItem>
              {/* Hiển thị cho mọi role. BE guard sẽ reject nếu không có quyền
                  (chỉ user đang giữ lead + manager dept + super_admin được phép transfer). */}
              <MenuItem
                icon={<ArrowRightLeft className="h-4 w-4" />}
                onClick={handleOpenTransferSubmenu}
                trailing={<ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              >
                Chuyển lead
              </MenuItem>
            </>
          ) : (
            <LeadTransferSubmenu
              leadId={leadId}
              leadName={lead?.name}
              currentDeptId={lead?.department?.id ?? null}
              currentStatus={lead?.status}
              onBack={() => setMenuMode('main')}
              onSuccess={closeMenuImmediate}
            />
          )}
        </PopoverContent>
      </Popover>

      <LeadEditDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        leadId={leadId}
        leadRow={lead}
      />

      <LeadQuickTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        leadId={leadId}
        leadName={lead?.name}
      />

      {orderCustomerId && (
        <LeadCreateOrderFlow
          customerId={orderCustomerId}
          leadId={leadId}
          leadName={lead?.name}
          open={flowOpen}
          onOpenChange={setFlowOpen}
          onSuccess={() => {
            setFlowOpen(false);
            router.refresh();
          }}
          defaultProductId={lead?.product?.id}
          defaultCustomerName={lead?.name ?? undefined}
          defaultCustomerPhone={lead?.phone ?? undefined}
        />
      )}
    </>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  /** Slot phải - dùng cho indicator submenu (ChevronRight). */
  trailing?: React.ReactNode;
}

function MenuItem({ icon, onClick, children, trailing }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
    >
      <span className="text-sky-500">{icon}</span>
      <span className="flex-1 text-left">{children}</span>
      {trailing}
    </button>
  );
}
