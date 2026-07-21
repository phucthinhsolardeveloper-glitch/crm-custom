import { serverFetch } from '@/lib/auth';
import type { LeadRecord, NamedEntity, LabelEntity, ActivityRecord, OrderRecord } from '@/types/entities';
import { StatusBadge } from '@/components/shared/status-badge';
import { ActivityTimelineWithFilterTabs } from '@/components/shared/activity-timeline-with-filter-tabs';
import { LeadActions } from '@/components/leads/lead-actions';
import { LeadDetailCallButton } from '@/components/leads/lead-detail-call-button';
import { CreateOrderFlowButton } from '@/components/orders/create-order-flow-button';
import { formatDateTime, formatVND } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Pencil, Phone, Mail, Building, Tag, User, Calendar, Package, ExternalLink } from 'lucide-react';
import { BackButton } from '@/components/shared/back-button';

/** Lead detail page: profile header + sidebar + orders + timeline. */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let leadData: LeadRecord | undefined;

  try {
    const result = await serverFetch<{ data: LeadRecord }>(`/leads/${id}`);
    leadData = result.data;
  } catch {
    notFound();
  }

  // notFound() throws, so leadData is always defined here
  const lead = leadData as LeadRecord;

  let activities: ActivityRecord[] = [];
  let users: NamedEntity[] = [];
  let departments: NamedEntity[] = [];
  let labels: LabelEntity[] = [];

  try {
    [activities, users, departments, labels] = await Promise.all([
      serverFetch<{ data: ActivityRecord[] }>(`/leads/${id}/activities`).then(r => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/users').then(r => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data).catch(() => []),
      serverFetch<{ data: LabelEntity[] }>('/labels').then(r => r.data).catch(() => []),
    ]);
  } catch { /* partial ok */ }

  const meta = lead.metadata;
  const aiScore = meta?.aiScore;
  const aiLevel = meta?.aiLevel;
  const aiSummary = meta?.aiSummary;
  const aiScoreReason = meta?.aiScoreReason;
  const levelColor = aiLevel === 'HOT' ? 'bg-red-500' : aiLevel === 'WARM' ? 'bg-amber-500' : aiLevel === 'COLD' ? 'bg-sky-500' : '';
  const levelText = aiLevel === 'HOT' ? 'Nóng' : aiLevel === 'WARM' ? 'Ấm' : aiLevel === 'COLD' ? 'Lạnh' : '';

  const initials = (lead.name || '?').split(' ').map((w: string) => w[0]).slice(-2).join('').toUpperCase();
  const orders = lead.orders || [];

  return (
    <div className="space-y-5">
      <BackButton />
      {/* ─── Profile Header Card ─────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-lg font-bold">
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            {/* Row 1: Name + Status + AI */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 truncate">{lead.name}</h1>
              <StatusBadge status={lead.status} />
              {aiScore && (
                <span className={`${levelColor} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
                  {aiScore}/10 {levelText}
                </span>
              )}
            </div>

            {/* Row 2: Company */}
            {lead.companyName && (
              <p className="text-sm text-slate-500 mt-0.5">{lead.companyName}</p>
            )}

            {/* Row 3: Contact info inline */}
            <div className="flex items-center gap-4 mt-2 flex-wrap text-sm">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-slate-600 hover:text-sky-600">
                <Phone className="h-3.5 w-3.5" />{lead.phone}
              </a>
              {lead.phone && (
                <LeadDetailCallButton phone={lead.phone} leadName={lead.name} />
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-slate-600 hover:text-sky-600">
                  <Mail className="h-3.5 w-3.5" />{lead.email}
                </a>
              )}
              {/* Social link badges */}
              {lead.facebookUrl && (
                <a href={lead.facebookUrl} target="_blank" rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100">Facebook</a>
              )}
              {lead.instagramUrl && (
                <a href={lead.instagramUrl} target="_blank" rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded bg-pink-50 text-pink-600 text-xs font-medium hover:bg-pink-100">Instagram</a>
              )}
              {lead.zaloUrl && (
                <a href={lead.zaloUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100">Zalo</a>
              )}
              {lead.linkedinUrl && (
                <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-xs font-medium hover:bg-sky-100">LinkedIn</a>
              )}
            </div>

            {/* Row 4: Single Label */}
            {lead.label && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: lead.label.color, color: lead.label.textColor || '#ffffff' }}>
                  {lead.label.name}
                </span>
              </div>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div className="mt-3 rounded-lg border border-purple-100 bg-purple-50/50 px-3 py-2">
                <p className="text-xs text-purple-800">{aiSummary}</p>
                {aiScoreReason && <p className="text-[10px] text-purple-500 mt-0.5">{aiScoreReason}</p>}
              </div>
            )}
          </div>

          {/* Edit button */}
          <Link href={`/leads/${id}/edit`} className="shrink-0">
            <Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1" />Sửa</Button>
          </Link>
        </div>

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <LeadActions lead={lead} users={users} departments={departments} labels={labels} />
          {['IN_PROGRESS', 'CONVERTED'].includes(lead.status) && (
            // Flow: khách còn đơn chưa TT đủ -> hỏi thêm TT cho đơn cũ hay tạo đơn mới
            <CreateOrderFlowButton
              customerId={lead.customerId ?? undefined}
              leadId={lead.id}
              leadName={lead.name ?? undefined}
              defaultProductId={lead.product?.id}
              defaultCustomerName={lead.name ?? undefined}
              defaultCustomerPhone={lead.phone ?? undefined}
            />
          )}
        </div>
      </div>

      {/* ─── Main Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sidebar */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-slate-900 text-sm">Chi tiết</h3>
            <dl className="space-y-2.5 text-sm">
              <DetailRow icon={<Tag className="h-3.5 w-3.5 text-slate-400" />} label="Nguồn" value={lead.source?.name} />
              {/* Nhóm = cấp con của Nguồn; thụt vào thể hiện quan hệ cha-con. Luôn hiện (chưa có -> "-"). */}
              <div className="flex items-center gap-2 pl-5">
                <span className="text-slate-300">└</span>
                <span className="text-slate-500">Nhóm</span>
                {lead.group ? (
                  <span className="ml-auto inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{lead.group.name}</span>
                ) : (
                  <span className="ml-auto text-slate-400">-</span>
                )}
              </div>
              <DetailRow icon={<Package className="h-3.5 w-3.5 text-slate-400" />} label="Sản phẩm" value={lead.product?.name} />
              <DetailRow icon={<User className="h-3.5 w-3.5 text-slate-400" />} label="Nhân viên" value={lead.assignedUser?.name} />
              <DetailRow icon={<Building className="h-3.5 w-3.5 text-slate-400" />} label="Phòng ban" value={lead.department?.name} />
              <DetailRow icon={<Calendar className="h-3.5 w-3.5 text-slate-400" />} label="Ngày tạo" value={formatDateTime(lead.createdAt)} />
              {lead.customer && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-500">Khách hàng</span>
                  <Link href={`/customers/${lead.customerId ?? ''}`} className="ml-auto text-sky-600 hover:underline text-sm">
                    {lead.customer.name}
                  </Link>
                </div>
              )}
            </dl>
          </div>

          {/* Custom metadata */}
          {meta && Object.keys(meta).filter(k => !k.startsWith('ai')).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-slate-900 text-sm">Thông tin thêm</h3>
              <dl className="space-y-2 text-sm">
                {Object.entries(meta).filter(([k]) => !k.startsWith('ai')).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-slate-700">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-5 lg:col-span-2">
          {/* Orders + Payments */}
          {orders.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-slate-900 text-sm">Đơn hàng ({orders.length})</h3>
              <div className="space-y-2.5">
                {(orders as OrderRecord[]).map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700 text-sm">#{o.id}</span>
                        <span className="text-slate-500 text-sm">{o.product?.name || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{formatVND(Number(o.totalAmount))}</span>
                        <StatusBadge status={o.status} />
                      </div>
                    </div>
                    {(o.payments?.length ?? 0) > 0 && (
                      <div className="border-t border-slate-100 px-3 py-1.5 space-y-1">
                        {o.payments!.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs text-slate-500">
                            <span>{p.paymentType?.name || 'CK'} {p.transferContent ? `- ${p.transferContent}` : ''}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-700">{formatVND(Number(p.amount))}</span>
                              <StatusBadge status={p.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity timeline */}
          <ActivityTimelineWithFilterTabs activities={activities as unknown as Parameters<typeof ActivityTimelineWithFilterTabs>[0]['activities']} />
        </div>
      </div>
    </div>
  );
}

/** Reusable detail row with icon */
function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-slate-500">{label}</span>
      <span className="ml-auto text-slate-700">{value || '-'}</span>
    </div>
  );
}
