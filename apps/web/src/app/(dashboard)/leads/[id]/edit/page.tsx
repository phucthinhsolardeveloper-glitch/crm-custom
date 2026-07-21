import { serverFetch } from '@/lib/auth';
import { LeadForm } from '@/components/leads/lead-form';
import { BackButton } from '@/components/shared/back-button';
import { notFound } from 'next/navigation';
import type { LeadRecord, NamedEntity } from '@/types/entities';

/** Edit lead page. */
export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let leadData: LeadRecord | undefined;
  let sources: NamedEntity[] = [];
  let groups: (NamedEntity & { sourceId: string })[] = [];
  let products: NamedEntity[] = [];

  try {
    [leadData, sources, groups, products] = await Promise.all([
      serverFetch<{ data: LeadRecord }>(`/leads/${id}`).then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/lead-sources').then(r => r.data),
      serverFetch<{ data: (NamedEntity & { sourceId: string })[] }>('/lead-groups').then(r => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/products').then(r => r.data),
    ]);
  } catch {
    notFound();
  }

  const lead = leadData as LeadRecord;

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-slate-900 mb-6 mt-2">Sửa lead: {lead.name}</h1>
      <LeadForm lead={lead} sources={sources} groups={groups} products={products} />
    </div>
  );
}
