import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import type { LeadRecord } from '@/types/entities';

/**
 * Tab File - placeholder.
 * Hệ thống hiện gắn document ở cấp Lead (lead-documents module).
 * Customer-level file upload chưa build - link sang lead nếu KH có lead.
 */
export function TabFiles({ customerId, leads }: { customerId: string; leads: LeadRecord[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
      <div className="text-sm font-semibold text-slate-700 mb-1">Quản lý file</div>
      <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
        Tài liệu được gắn vào từng Lead. Xem file của KH này qua các lead bên dưới.
      </p>
      {leads.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {leads.slice(0, 6).map((lead) => (
            <Link
              key={lead.id}
              href={`/leads/${lead.id}`}
              className="text-xs px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 font-semibold hover:bg-sky-100 transition-colors"
            >
              Lead #{lead.id}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Chưa có lead nào để link file</p>
      )}
      <Link
        href={`/customers/${customerId}?tab=leads`}
        className="block mt-4 text-xs text-sky-600 hover:underline"
      >
        Xem tất cả lead →
      </Link>
    </div>
  );
}
