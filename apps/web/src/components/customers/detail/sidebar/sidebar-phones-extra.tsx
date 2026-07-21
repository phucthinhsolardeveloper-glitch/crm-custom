import { Phone } from 'lucide-react';
import type { CustomerPhoneRecord } from '@/types/entities';

/**
 * Compact list view của số phụ trong sidebar.
 * View-only (không CRUD ở đây) - CRUD ở trang Edit hoặc dialog riêng.
 * Ẩn hoàn toàn nếu KH không có số phụ.
 */
export function SidebarPhonesExtra({ phones }: { phones: CustomerPhoneRecord[] }) {
  if (phones.length === 0) return null;
  return (
    <div className="py-4 border-b border-slate-100">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        SĐT phụ ({phones.length})
      </div>
      <ul className="space-y-1.5">
        {phones.map((p) => (
          <li key={p.id} className="flex items-start gap-2 text-xs">
            <Phone className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-slate-800 font-semibold">{p.phone}</div>
              {(p.label || p.note) && (
                <div className="text-slate-500 text-[11px] truncate" title={`${p.label ?? ''} ${p.note ?? ''}`.trim()}>
                  {p.label}
                  {p.label && p.note ? ' · ' : ''}
                  {p.note}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
