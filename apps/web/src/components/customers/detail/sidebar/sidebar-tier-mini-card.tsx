import type { CustomerRecord } from '@/types/entities';
import { formatCompactMoney } from '@/lib/utils';
import { Award, Trophy, Medal, Gem, Crown, Star } from 'lucide-react';

const ICON_MAP: Record<string, typeof Award> = { Award, Trophy, Medal, Gem, Crown, Star };

/**
 * Mini card hạng KH trong sidebar.
 * Gradient nền theo tier.color, icon/emoji nổi bật, hiển thị tổng chi tiêu.
 * Render null nếu customer chưa có tier (hạn chế UI rác khi backfill chưa xong).
 */
export function SidebarTierMiniCard({ customer }: { customer: CustomerRecord }) {
  const tier = customer.currentTier;
  if (!tier) return null;
  const totalSpent = customer.totalSpent ?? '0';
  const Icon = tier.iconKey && ICON_MAP[tier.iconKey];

  return (
    <div className="py-4 border-b border-slate-100">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        Hạng & chi tiêu
      </div>
      <div
        className="rounded-xl p-3 text-white shadow-sm"
        style={{ background: `linear-gradient(135deg, ${tier.color}dd 0%, ${tier.color} 100%)` }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase opacity-90 tracking-wide font-semibold">Tổng chi tiêu</p>
            <p className="text-lg font-extrabold">{formatCompactMoney(Number(totalSpent))}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-xl">
            {tier.emoji ? (
              <span aria-hidden>{tier.emoji}</span>
            ) : Icon ? (
              <Icon className="w-5 h-5" />
            ) : null}
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-white/20 text-[11px] opacity-95 font-medium">
          Hạng {tier.name}
        </div>
      </div>
    </div>
  );
}
