import type { CustomerRecord, ProductRecord, NamedEntity } from '@/types/entities';
import { type CustomerTabKey } from '@/lib/customer-tabs';
import { CustomerTopStrip } from './main/customer-top-strip';
import { CustomerTabBar } from './main/customer-tab-bar';
import { TabOverview } from './tabs/tab-overview';
import { TabOrders } from './tabs/tab-orders';
import { TabLeads } from './tabs/tab-leads';
import { TabActivity } from './tabs/tab-activity';
import { TabNotes } from './tabs/tab-notes';
import { TabPayments } from './tabs/tab-payments';
import { TabFiles } from './tabs/tab-files';

interface Props {
  customer: CustomerRecord;
  activeTab: CustomerTabKey;
  products: ProductRecord[];
  paymentTypes: NamedEntity[];
}

/**
 * Main area: top strip + tab bar + tab content dispatcher.
 * Counts cho tab badges đến từ customer._count.
 */
export function CustomerMainArea({ customer, activeTab, products, paymentTypes }: Props) {
  const counts = {
    orders: customer._count?.orders ?? customer.orders?.length ?? 0,
    leads: customer._count?.leads ?? customer.leads?.length ?? 0,
  };

  return (
    <div>
      <CustomerTopStrip
        customer={customer}
        activeTab={activeTab}
        products={products}
        paymentTypes={paymentTypes}
      />
      <CustomerTabBar activeTab={activeTab} counts={counts} />
      <TabContent customer={customer} activeTab={activeTab} />
    </div>
  );
}

function TabContent({ customer, activeTab }: { customer: CustomerRecord; activeTab: CustomerTabKey }) {
  switch (activeTab) {
    case 'overview':
      return <TabOverview customer={customer} />;
    case 'orders':
      return <TabOrders orders={customer.orders ?? []} />;
    case 'leads':
      return <TabLeads leads={customer.leads ?? []} />;
    case 'activity':
      return <TabActivity customerId={customer.id} />;
    case 'notes':
      return <TabNotes customerId={customer.id} />;
    case 'payments':
      return <TabPayments orders={customer.orders ?? []} />;
    case 'files':
      return <TabFiles customerId={customer.id} leads={customer.leads ?? []} />;
    default:
      return null;
  }
}
