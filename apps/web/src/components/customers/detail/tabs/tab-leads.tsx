import Link from 'next/link';
import type { LeadRecord } from '@/types/entities';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';

export function TabLeads({ leads }: { leads: LeadRecord[] }) {
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="text-4xl mb-2">🎯</div>
        <div className="text-sm font-semibold text-slate-700">Chưa có lead</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
      {leads.map((lead) => (
        <Link
          key={lead.id}
          href={`/leads/${lead.id}`}
          className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
        >
          <span className="font-mono text-xs text-slate-500 w-16 shrink-0">#{lead.id}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">
              {lead.product?.name ?? 'Chưa gán sản phẩm'}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {formatDate(lead.createdAt)}
              {lead.source && ` · ${lead.source.name}`}
              {lead.assignedUser && ` · ${lead.assignedUser.name}`}
            </div>
          </div>
          {lead.label && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"
              style={{ backgroundColor: lead.label.color, color: lead.label.textColor || '#fff' }}
            >
              {lead.label.name}
            </span>
          )}
          <StatusBadge status={lead.status} />
        </Link>
      ))}
    </div>
  );
}
