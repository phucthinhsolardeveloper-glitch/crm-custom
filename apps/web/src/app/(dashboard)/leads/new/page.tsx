import { serverFetch } from '@/lib/auth';
import { LeadForm } from '@/components/leads/lead-form';
import { BackButton } from '@/components/shared/back-button';
import type { NamedEntity } from '@/types/entities';

/** Create new lead page. */
type GroupOption = NamedEntity & { sourceId: string };

export default async function CreateLeadPage() {
  let sources: NamedEntity[] = [];
  let groups: GroupOption[] = [];
  let products: NamedEntity[] = [];

  try {
    [sources, groups, products] = await Promise.all([
      serverFetch<{ data: NamedEntity[] }>('/lead-sources').then(r => r.data),
      serverFetch<{ data: GroupOption[] }>('/lead-groups').then(r => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/products').then(r => r.data),
    ]);
  } catch { /* empty */ }

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-slate-900 mb-6 mt-2">Tạo lead mới</h1>
      <LeadForm sources={sources} groups={groups} products={products} />
    </div>
  );
}
