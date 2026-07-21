import type { CustomerRecord } from '@/types/entities';
import { SidebarIdentityHero } from './sidebar-identity-hero';
import { SidebarInfoList } from './sidebar-info-list';
import { SidebarTierMiniCard } from './sidebar-tier-mini-card';
import { SidebarLabelsAndSocial } from './sidebar-labels-and-social';
import { SidebarPhonesExtra } from './sidebar-phones-extra';

// AI Insight ở main area là source of truth cho phân tích - bỏ "Tiềm năng" sidebar để tránh trùng.
export function CustomerSidebar({ customer }: { customer: CustomerRecord }) {
  return (
    <div className="flex flex-col">
      <SidebarIdentityHero customer={customer} />
      <SidebarInfoList customer={customer} />
      <SidebarTierMiniCard customer={customer} />
      <SidebarLabelsAndSocial customer={customer} />
      <SidebarPhonesExtra phones={customer.phones ?? []} />
    </div>
  );
}
