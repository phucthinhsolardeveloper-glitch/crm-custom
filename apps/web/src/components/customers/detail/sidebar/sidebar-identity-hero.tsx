'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import type { CustomerRecord } from '@/types/entities';
import { getInitials } from '@/lib/utils';
import { TierBadge, TierIconOnly } from '@/components/customers/tier-badge';
import { AvatarUploadModal } from '@/components/customers/avatar-upload-modal';

/**
 * Hero card đầu sidebar: avatar 96px, name, sub line, status pill, tier pill.
 * Avatar URL → render img; null → fallback gradient + initials.
 * Tier có → overlay icon góc dưới-phải + pill cạnh status.
 * Hover avatar → camera button overlay (click → mở modal upload).
 */
export function SidebarIdentityHero({ customer }: { customer: CustomerRecord }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const initials = getInitials(customer.name);
  const visibleLabels = (customer.labels ?? []).slice(0, 3);
  const hiddenLabelCount = Math.max(0, (customer.labels?.length ?? 0) - 3);
  const tier = customer.currentTier;

  return (
    <div className="flex flex-col items-center text-center pb-4 border-b border-slate-100">
      <div className="relative group">
        {customer.avatarUrl ? (
          <img
            src={customer.avatarUrl}
            alt={`Ảnh đại diện ${customer.name}`}
            className="w-24 h-24 rounded-full object-cover shadow-md ring-4 ring-white"
          />
        ) : (
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-md ring-4 ring-white"
            style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)' }}
            aria-label={`Ảnh đại diện ${customer.name}`}
          >
            {initials}
          </div>
        )}

        {/* Tier overlay góc dưới-phải */}
        {tier && (
          <TierIconOnly
            tier={tier}
            className="absolute -bottom-1 -right-1 w-9 h-9"
          />
        )}

        {/* Camera hover overlay - click mở modal upload */}
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors text-white opacity-0 group-hover:opacity-100"
          aria-label="Cập nhật ảnh đại diện"
          title="Cập nhật ảnh đại diện"
        >
          <Camera className="w-6 h-6" />
        </button>
      </div>

      <h2 className="mt-3 text-lg font-bold text-slate-900 line-clamp-2">{customer.name}</h2>
      <div className="mt-1 text-xs text-slate-500">
        {customer.phone ?? '-'}
        {customer.companyName ? ` · ${customer.companyName}` : ''}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1 justify-center items-center">
        <CustomerStatusPill status={customer.status} />
        {tier && <TierBadge tier={tier} size="sm" />}
        {visibleLabels.map((cl) => (
          <span
            key={cl.label.id}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: cl.label.color, color: cl.label.textColor || '#fff' }}
            title={cl.label.name}
          >
            {cl.label.name}
          </span>
        ))}
        {hiddenLabelCount > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600">
            +{hiddenLabelCount}
          </span>
        )}
      </div>

      <AvatarUploadModal
        customerId={customer.id}
        customerName={customer.name}
        currentUrl={customer.avatarUrl}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </div>
  );
}

const STATUS_COLOR_MAP: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Đang chăm' },
  INACTIVE: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Đã xong' },
  FLOATING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Thả nổi' },
};

function CustomerStatusPill({ status }: { status: string }) {
  const cfg = STATUS_COLOR_MAP[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}
