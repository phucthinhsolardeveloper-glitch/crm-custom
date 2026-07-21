import { serverFetch } from '@/lib/auth';
import type { CustomerRecord, NamedEntity, ProductRecord } from '@/types/entities';
import { notFound } from 'next/navigation';
import { parseCustomerTab } from '@/lib/customer-tabs';
import { CustomerDetailLayout } from '@/components/customers/detail/customer-detail-layout';
import { CustomerSidebar } from '@/components/customers/detail/sidebar/customer-sidebar';
import { CustomerMainArea } from '@/components/customers/detail/customer-main-area';

/**
 * Customer detail page (hybrid bento + sidebar layout).
 * - URL `?tab=overview|orders|leads|activity|notes|payments|files` quyết định tab active.
 * - Server Component fetch customer + lookup data, render sidebar (sticky) + main area.
 */
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const activeTab = parseCustomerTab(rawTab);

  let customerData: CustomerRecord | undefined;
  try {
    const result = await serverFetch<{ data: CustomerRecord }>(`/customers/${id}`);
    customerData = result.data;
  } catch {
    notFound();
  }
  const customer = customerData as CustomerRecord;

  let products: ProductRecord[] = [];
  let paymentTypes: NamedEntity[] = [];
  try {
    [products, paymentTypes] = await Promise.all([
      serverFetch<{ data: ProductRecord[] }>('/products').then((r) => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/payment-types').then((r) => r.data).catch(() => []),
    ]);
  } catch {
    /* partial ok */
  }

  return (
    <CustomerDetailLayout
      sidebar={<CustomerSidebar customer={customer} />}
      main={
        <CustomerMainArea
          customer={customer}
          activeTab={activeTab}
          products={products}
          paymentTypes={paymentTypes}
        />
      }
    />
  );
}
