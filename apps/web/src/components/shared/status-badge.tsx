import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  // Lead statuses
  POOL: 'bg-sky-100 text-sky-700',
  ZOOM: 'bg-orange-100 text-orange-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  CONVERTED: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-red-100 text-red-700',
  FLOATING: 'bg-violet-100 text-violet-700',
  // Customer statuses
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
  // Order statuses (2 trang thai: PENDING, COMPLETED)
  PENDING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  // Payment statuses (5 trang thai)
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-orange-100 text-orange-700',
  REFUNDED: 'bg-slate-100 text-slate-500',
  CANCELLED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  POOL: 'Kho',
  ZOOM: 'Zoom',
  ASSIGNED: 'Đã gán',
  IN_PROGRESS: 'Đang xử lý',
  CONVERTED: 'Đã chuyển đổi',
  LOST: 'Mất',
  FLOATING: 'Thả nổi',
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng',
  PENDING: 'Chờ xử lý',
  COMPLETED: 'Hoàn thành',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Sai thông tin',
  REFUNDED: 'Đã hoàn tiền',
  CANCELLED: 'Đã huỷ',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      STATUS_STYLES[status] || 'bg-slate-100 text-slate-600',
    )}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
