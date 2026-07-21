'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import type { CustomerRecord } from '@/types/entities';
import { TierBadge } from './tier-badge';
import { cn, formatNumber, getInitials } from '@/lib/utils';

// Deterministic gradient picker for avatar fallback - 6 presets cycle by name hash.
const AVATAR_GRADIENTS = [
  'from-amber-500 to-amber-700',
  'from-pink-500 to-rose-500',
  'from-violet-500 to-violet-700',
  'from-emerald-500 to-cyan-500',
  'from-indigo-500 to-violet-500',
  'from-teal-500 to-cyan-600',
];

function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function formatVNDInteger(raw: string | null | undefined): string {
  const n = Number(raw || 0);
  if (!Number.isFinite(n)) return '0';
  return formatNumber(n);
}

function formatLastContact(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays <= 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 30) return `${diffDays} ngày trước`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
  return `${Math.floor(diffDays / 365)} năm trước`;
}

interface CardProps {
  customer: CustomerRecord;
}

function CustomerCard({ customer: c }: CardProps) {
  const totalSpentNumber = Number(c.totalSpent || 0);
  const ordersCount = c._count?.orders ?? 0;
  const labels = c.labels ?? [];
  const visibleLabels = labels.slice(0, 3);
  const extraLabels = labels.length - visibleLabels.length;
  const gradient = avatarGradient(c.name);

  return (
    <Link
      href={`/customers/${c.id}`}
      className={cn(
        'group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white p-4',
        'transition-all duration-200 hover:-translate-y-1 hover:border-sky-200',
        'hover:shadow-[0_20px_40px_-15px_rgba(14,165,233,0.25),0_8px_16px_-8px_rgba(15,23,42,0.08)]',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-500 to-cyan-500 opacity-0 transition-opacity group-hover:opacity-100"
      />

      {/* Head: avatar + name + phone + tier */}
      <div className="mb-3 flex items-start gap-3">
        <div
          className={cn(
            'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white bg-gradient-to-br',
            gradient,
          )}
          aria-hidden
        >
          {getInitials(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight text-slate-900">{c.name}</div>
          <div className="mt-0.5 text-xs tabular-nums text-slate-500">{c.phone || '-'}</div>
          {c.currentTier && (
            <div className="mt-1.5">
              <TierBadge tier={c.currentTier} size="sm" />
            </div>
          )}
        </div>
      </div>

      {/* Spend block - signature gradient hero */}
      <div className="mb-2.5 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-cyan-50 px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
          Tổng chi tiêu
        </div>
        <div className="text-[17px] font-extrabold tabular-nums text-slate-900">
          {totalSpentNumber === 0 ? (
            <span className="text-sm text-slate-500">Chưa có đơn</span>
          ) : (
            <>
              {formatVNDInteger(c.totalSpent)}
              <span className="ml-1 text-[11px] font-semibold text-slate-500">đ</span>
            </>
          )}
        </div>
      </div>

      {/* Meta row: orders + last contact */}
      <div className="mb-2.5 grid grid-cols-2 gap-2 border-y border-dashed border-slate-200 py-2">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Đơn hàng
          </div>
          <div className="mt-0.5 text-xs font-semibold text-slate-700">{ordersCount} đơn</div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Liên hệ cuối
          </div>
          <div className="mt-0.5 text-xs font-semibold text-slate-700">
            {formatLastContact(c.lastContactAt)}
          </div>
        </div>
      </div>

      {/* Footer labels */}
      <div className="flex min-h-[20px] flex-wrap items-center gap-1">
        {visibleLabels.map((l) => (
          <span
            key={l.label.id}
            className="rounded-md px-2 py-0.5 text-[10px] font-bold leading-tight"
            style={{ background: l.label.color, color: l.label.textColor }}
          >
            {l.label.name}
          </span>
        ))}
        {extraLabels > 0 && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            +{extraLabels}
          </span>
        )}
      </div>
    </Link>
  );
}

interface GridProps {
  customers: CustomerRecord[];
}

/** Card grid replacement for legacy table view. 1/2/3/4-col responsive. */
export function CustomerCardGrid({ customers }: GridProps) {
  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <Users className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
        <div className="text-sm font-semibold text-slate-600">Không có khách hàng nào</div>
        <div className="mt-1 text-xs text-slate-400">
          Thử bỏ bớt bộ lọc hoặc tạo khách hàng mới
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {customers.map((c) => (
        <CustomerCard key={c.id} customer={c} />
      ))}
    </div>
  );
}
