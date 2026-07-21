import type { ReactNode } from 'react';
import { Phone, Mail, Building2, Cake, Briefcase, MapPin, Calendar } from 'lucide-react';
import type { CustomerRecord } from '@/types/entities';
import { formatDate } from '@/lib/utils';
import { formatAddress } from '@/lib/address-kit';

// Info list cho sidebar - icon Lucide trong pill màu để vibrant.
// Ngày sinh luôn hiển thị (kể cả null) để sale biết feature tồn tại và cần bổ sung.
export function SidebarInfoList({ customer }: { customer: CustomerRecord }) {
  // Phòng ban lấy từ lead CONVERTED gần nhất (fallback lead gần nhất) - computed ở backend.
  const leadDepartmentName = customer.leadDepartment?.name ?? null;
  const addressText = formatAddress({
    street: customer.addressStreet,
    wardName: customer.addressWardName,
    provinceName: customer.addressProvinceName,
  });
  const birthdayText = customer.birthday ? formatDate(customer.birthday) : null;
  const daysUntil = customer.daysUntilBirthday;
  const showBirthdayBadge =
    birthdayText && daysUntil !== null && daysUntil !== undefined && daysUntil <= 90;

  return (
    <div className="py-4 border-b border-slate-100">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        Thông tin
      </div>
      <ul className="space-y-2">
        <Row
          icon={<Phone className="w-3.5 h-3.5" />}
          tone="sky"
          value={customer.phone ?? '-'}
          mono
        />
        <Row
          icon={<Mail className="w-3.5 h-3.5" />}
          tone="cyan"
          value={customer.email ?? '-'}
        />
        {customer.companyName && (
          <Row
            icon={<Building2 className="w-3.5 h-3.5" />}
            tone="violet"
            value={customer.companyName}
          />
        )}
        <Row
          icon={<Cake className="w-3.5 h-3.5" />}
          tone="pink"
          value={birthdayText ?? 'Chưa có ngày sinh'}
          muted={!birthdayText}
          badge={
            showBirthdayBadge ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900 shrink-0">
                {daysUntil === 0 ? 'Hôm nay' : `còn ${daysUntil}d`}
              </span>
            ) : null
          }
        />
        {leadDepartmentName && (
          <Row
            icon={<Briefcase className="w-3.5 h-3.5" />}
            tone="indigo"
            value={leadDepartmentName}
          />
        )}
        {addressText && (
          <Row
            icon={<MapPin className="w-3.5 h-3.5" />}
            tone="rose"
            value={addressText}
            multiline
          />
        )}
        <Row
          icon={<Calendar className="w-3.5 h-3.5" />}
          tone="amber"
          value={`Tạo: ${formatDate(customer.createdAt)}`}
        />
      </ul>
    </div>
  );
}

const TONE_BG: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600',
  cyan: 'bg-cyan-50 text-cyan-600',
  rose: 'bg-rose-50 text-rose-600',
  pink: 'bg-pink-50 text-pink-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  indigo: 'bg-indigo-50 text-indigo-600',
};

interface RowProps {
  icon: ReactNode;
  tone: keyof typeof TONE_BG | string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  multiline?: boolean;
  badge?: ReactNode;
}

function Row({ icon, tone, value, mono, muted, multiline, badge }: RowProps) {
  const toneClass = TONE_BG[tone] ?? TONE_BG.sky;
  return (
    <li className={`flex gap-2.5 text-sm ${multiline ? 'items-start' : 'items-center'}`}>
      <span
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${toneClass} ${multiline ? 'mt-0.5' : ''}`}
      >
        {icon}
      </span>
      <span
        className={`flex-1 font-medium ${multiline ? 'leading-snug' : 'truncate'} ${muted ? 'text-slate-400 italic' : 'text-slate-700'} ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
      {badge}
    </li>
  );
}
