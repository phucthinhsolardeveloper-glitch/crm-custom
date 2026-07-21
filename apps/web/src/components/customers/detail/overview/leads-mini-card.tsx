import Link from 'next/link';
import { Target } from 'lucide-react';
import type { LeadRecord } from '@/types/entities';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';

export function LeadsMiniCard({ leads }: { leads: LeadRecord[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm h-full transition-shadow hover:shadow-md">
      <h5 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
        <Target className="h-4 w-4 text-emerald-600" /> Lead ({leads.length})
      </h5>
      {leads.length === 0 ? (
        <p className="text-xs text-slate-500">Chưa có lead</p>
      ) : (
        <ul className="space-y-1.5">
          {leads.slice(0, 4).map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="font-mono text-[11px] text-slate-500 shrink-0">#{lead.id}</span>
                <span className="text-xs text-slate-600 truncate flex-1">
                  {formatDate(lead.createdAt)}
                  {lead.source && ` · ${lead.source.name}`}
                </span>
                <StatusBadge status={lead.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
