import type { CustomerRecord } from '@/types/entities';
import { KpiStrip } from '../overview/kpi-strip';
import { RecentLeadNotesCard } from '../overview/recent-lead-notes-card';
import { AiInsightCard } from '../overview/ai-insight-card';
import { PaymentDonutCard } from '../overview/payment-donut-card';
import { OrdersMiniCard } from '../overview/orders-mini-card';
import { ActivityMiniCard } from '../overview/activity-mini-card';
import { LeadsMiniCard } from '../overview/leads-mini-card';

/**
 * Composition root cho tab "Tổng quan".
 * Layout bento:
 *   KPI strip (3 cards: Tổng đơn + Doanh thu + Chi tiêu verified + hạng)
 *   Recent lead notes (full width) - 3 ghi chú gần nhất từ các lead liên kết
 *   Row 1: AI Insight (hero, col-span-2) + PaymentDonut (col-span-1)
 *   Row 2 (3 cards): Orders mini | Activity mini | Leads mini
 */
export function TabOverview({ customer }: { customer: CustomerRecord }) {
  return (
    <div className="space-y-3.5">
      <KpiStrip customer={customer} />
      <RecentLeadNotesCard customerId={customer.id} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="md:col-span-2">
          <AiInsightCard
            customerId={customer.id}
            shortDescription={customer.shortDescription}
            description={customer.description}
            aiRating={customer.aiRating}
          />
        </div>
        <PaymentDonutCard customerId={customer.id} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <OrdersMiniCard customerId={customer.id} orders={customer.orders ?? []} />
        <ActivityMiniCard customerId={customer.id} />
        <LeadsMiniCard leads={customer.leads ?? []} />
      </div>
    </div>
  );
}
