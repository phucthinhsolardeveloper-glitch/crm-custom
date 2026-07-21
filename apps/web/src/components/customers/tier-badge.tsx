import type { CustomerTier } from '@/types/entities';
import { Award, Trophy, Medal, Gem, Crown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, typeof Award> = {
  Award,
  Trophy,
  Medal,
  Gem,
  Crown,
  Star,
};

interface Props {
  tier: Pick<CustomerTier, 'name' | 'color' | 'emoji' | 'iconKey'> | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Hiển thị tier badge (emoji ưu tiên, fallback Lucide icon).
 * Trả null nếu tier null → caller không cần check.
 */
export function TierBadge({ tier, size = 'sm', className }: Props) {
  if (!tier) return null;

  const sizeClass = size === 'sm'
    ? 'px-2 py-0.5 text-[10px] gap-1'
    : 'px-2.5 py-1 text-xs gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  const Icon = tier.iconKey && ICON_MAP[tier.iconKey];

  return (
    <span
      className={cn(
        'rounded-full font-bold text-white inline-flex items-center shadow-sm',
        sizeClass,
        className,
      )}
      style={{ backgroundColor: tier.color }}
      title={`Hạng ${tier.name}`}
    >
      {tier.emoji ? (
        <span className="leading-none" aria-hidden>{tier.emoji}</span>
      ) : Icon ? (
        <Icon className={iconSize} />
      ) : null}
      <span className="truncate max-w-[120px]">{tier.name}</span>
    </span>
  );
}

/**
 * Render chỉ icon/emoji (không có name) - dùng cho overlay góc avatar.
 */
export function TierIconOnly({
  tier,
  className,
}: {
  tier: Pick<CustomerTier, 'color' | 'emoji' | 'iconKey' | 'name'> | null | undefined;
  className?: string;
}) {
  if (!tier) return null;
  const Icon = tier.iconKey && ICON_MAP[tier.iconKey];
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white border-2 border-white shadow-md',
        className,
      )}
      style={{ backgroundColor: tier.color }}
      title={`Hạng ${tier.name}`}
      aria-label={`Hạng ${tier.name}`}
    >
      {tier.emoji ? (
        <span aria-hidden className="text-base leading-none">{tier.emoji}</span>
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
    </div>
  );
}
