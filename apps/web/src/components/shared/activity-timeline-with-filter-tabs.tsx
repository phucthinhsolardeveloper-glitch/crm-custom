'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { MessageSquare, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, ArrowRightLeft, FileText, Activity, ShoppingCart, CreditCard, CheckCircle } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  content?: string;
  user?: { name: string };
  createdAt: string;
  metadata?: { type?: string; duration?: number; [key: string]: unknown } | null;
}

const TABS = [
  { value: 'ALL', label: 'Tất cả', icon: Activity },
  { value: 'NOTE', label: 'Ghi chú', icon: MessageSquare },
  { value: 'CALL', label: 'Cuộc gọi', icon: Phone },
  { value: 'STATUS_CHANGE', label: 'Trạng thái', icon: ArrowRightLeft },
  { value: 'PAYMENT', label: 'Thanh toán', icon: CreditCard },
  { value: 'OTHER', label: 'Khác', icon: FileText },
] as const;

// Types grouped under "Khác"
const OTHER_TYPES = ['ASSIGNMENT', 'TRANSFER', 'CLAIM', 'CONVERT', 'LABEL'];

// Metadata types that indicate payment/order activities (stored as NOTE type)
const PAYMENT_META_TYPES = ['ORDER_CREATED', 'PAYMENT_CREATED', 'PAYMENT_VERIFIED'];

const PER_PAGE = 5;

/** Check if a NOTE activity is actually a payment/order activity via metadata */
function isPaymentActivity(a: ActivityItem): boolean {
  return !!a.metadata?.type && PAYMENT_META_TYPES.includes(a.metadata.type);
}

/** Get effective display type - resolves NOTE+metadata into ORDER/PAYMENT */
function getEffectiveType(a: ActivityItem): string {
  if (a.type === 'NOTE' && a.metadata?.type) {
    if (a.metadata.type === 'ORDER_CREATED') return 'ORDER';
    if (a.metadata.type === 'PAYMENT_CREATED' || a.metadata.type === 'PAYMENT_VERIFIED') return 'PAYMENT';
  }
  return a.type;
}

function getTypeLabelByEffective(effectiveType: string, metaType?: string): string {
  if (metaType === 'ORDER_CREATED') return 'Tạo đơn hàng';
  if (metaType === 'PAYMENT_CREATED') return 'Thanh toán';
  if (metaType === 'PAYMENT_VERIFIED') return 'Xác nhận TT';
  const map: Record<string, string> = {
    NOTE: 'Ghi chú', CALL: 'Cuộc gọi', STATUS_CHANGE: 'Đổi trạng thái',
    ASSIGNMENT: 'Phân lead', TRANSFER: 'Chuyển', CLAIM: 'Nhận',
    CONVERT: 'Chuyển đổi KH', LABEL: 'Nhãn', ORDER: 'Đơn hàng', PAYMENT: 'Thanh toán',
  };
  return map[effectiveType] || effectiveType;
}

function getTypeIconByEffective(effectiveType: string, metaType?: string) {
  if (metaType === 'ORDER_CREATED') return <ShoppingCart className="h-4 w-4" />;
  if (metaType === 'PAYMENT_CREATED') return <CreditCard className="h-4 w-4" />;
  if (metaType === 'PAYMENT_VERIFIED') return <CheckCircle className="h-4 w-4" />;
  if (effectiveType === 'NOTE') return <MessageSquare className="h-4 w-4" />;
  if (effectiveType === 'CALL') return <Phone className="h-4 w-4" />;
  if (effectiveType === 'STATUS_CHANGE') return <ArrowRightLeft className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

/** Màu thẻ + nền card theo loại hoạt động -> [tagBg, tagText, cardBg] */
function getColorByEffective(effectiveType: string, metaType?: string): [string, string, string] {
  if (metaType === 'ORDER_CREATED') return ['bg-blue-50', 'text-blue-700', 'bg-blue-50/40'];
  if (metaType === 'PAYMENT_CREATED' || metaType === 'PAYMENT_VERIFIED') return ['bg-emerald-50', 'text-emerald-700', 'bg-emerald-50/40'];
  if (effectiveType === 'NOTE') return ['bg-sky-50', 'text-sky-700', 'bg-slate-50/40'];
  if (effectiveType === 'CALL') return ['bg-green-50', 'text-green-700', 'bg-slate-50/40'];
  if (effectiveType === 'STATUS_CHANGE') return ['bg-amber-50', 'text-amber-700', 'bg-slate-50/40'];
  return ['bg-slate-100', 'text-slate-600', 'bg-slate-50/40'];
}

// Bảng màu avatar - mỗi người 1 màu cố định (hash từ tên).
const AVATAR_PALETTE: [string, string][] = [
  ['bg-sky-100', 'text-sky-700'],
  ['bg-violet-100', 'text-violet-700'],
  ['bg-emerald-100', 'text-emerald-700'],
  ['bg-amber-100', 'text-amber-700'],
  ['bg-rose-100', 'text-rose-700'],
  ['bg-cyan-100', 'text-cyan-700'],
  ['bg-indigo-100', 'text-indigo-700'],
  ['bg-teal-100', 'text-teal-700'],
  ['bg-fuchsia-100', 'text-fuchsia-700'],
  ['bg-orange-100', 'text-orange-700'],
];

/** Màu avatar cố định theo tên người (cùng tên -> cùng màu) */
function getPersonColor(name?: string): [string, string] {
  if (!name) return ['bg-slate-100', 'text-slate-500'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Lấy 2 ký tự đầu của tên cho avatar */
function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
}

// Hướng cuộc gọi (enum CallType) -> nhãn tiếng Việt
const CALL_DIRECTION: Record<string, string> = {
  INCOMING: 'Gọi đến', OUTGOING: 'Gọi đi', MISSED: 'Gọi nhỡ',
};

// Màu thẻ theo hướng gọi: đi=xanh lá, đến=xanh dương, nhỡ=đỏ
const CALL_COLOR: Record<string, [string, string]> = {
  INCOMING: ['bg-sky-50', 'text-sky-700'],
  OUTGOING: ['bg-green-50', 'text-green-700'],
  MISSED: ['bg-rose-50', 'text-rose-700'],
};

/** Icon cuộc gọi phân hướng: gọi đến / gọi đi / gọi nhỡ */
function getCallIcon(callType?: string) {
  if (callType === 'INCOMING') return <PhoneIncoming className="h-4 w-4" />;
  if (callType === 'OUTGOING') return <PhoneOutgoing className="h-4 w-4" />;
  if (callType === 'MISSED') return <PhoneMissed className="h-4 w-4" />;
  return <Phone className="h-4 w-4" />;
}

/** Format giây -> "X phút Y giây" (hoặc "Y giây" nếu < 1 phút) */
function formatCallDuration(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m} phút ${s} giây` : `${s} giây`;
}

/** Activity timeline với tab lọc + avatar người làm + phân trang */
export function ActivityTimelineWithFilterTabs({ activities }: { activities: ActivityItem[] }) {
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const filtered = activeTab === 'ALL'
    ? activities
    : activeTab === 'PAYMENT'
      ? activities.filter(a => isPaymentActivity(a))
      : activeTab === 'NOTE'
        ? activities.filter(a => a.type === 'NOTE' && !isPaymentActivity(a))
        : activeTab === 'OTHER'
          ? activities.filter(a => OTHER_TYPES.includes(a.type))
          : activities.filter(a => a.type === activeTab);

  // Count per tab (using effective types)
  const counts: Record<string, number> = { ALL: activities.length };
  activities.forEach(a => {
    if (isPaymentActivity(a)) {
      counts['PAYMENT'] = (counts['PAYMENT'] || 0) + 1;
    } else if (OTHER_TYPES.includes(a.type)) {
      counts['OTHER'] = (counts['OTHER'] || 0) + 1;
    } else {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
  });

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function switchTab(value: string) {
    setActiveTab(value);
    setPage(1); // đổi tab thì về trang 1
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Lịch sử hoạt động</h3>
        <span className="text-xs text-slate-400">{filtered.length} hoạt động</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(tab => {
          const count = counts[tab.value] || 0;
          if (tab.value !== 'ALL' && count === 0) return null;
          return (
            <button
              key={tab.value}
              onClick={() => switchTab(tab.value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.value
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                activeTab === tab.value ? 'bg-sky-200 text-sky-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {pageItems.length === 0 ? (
        <p className="text-sm text-slate-400 py-4">Chưa có hoạt động nào</p>
      ) : (
        <div className="space-y-3">
          {pageItems.map((a) => {
            const effectiveType = getEffectiveType(a);
            const metaType = a.metadata?.type;
            const [avBg, avTx] = getPersonColor(a.user?.name); // màu riêng từng người
            // Cuộc gọi: render gọn (hướng gọi + thời lượng), không hiện content thô.
            const isCall = effectiveType === 'CALL';
            const callType = a.metadata?.callType as string | undefined;
            const callLabel = isCall ? (CALL_DIRECTION[callType ?? ''] ?? 'Cuộc gọi') : getTypeLabelByEffective(effectiveType, metaType);
            const callDuration = isCall ? formatCallDuration(a.metadata?.duration) : '';
            // Màu thẻ + icon: cuộc gọi theo hướng, loại khác theo type.
            const [baseTagBg, baseTagTx, cardBg] = getColorByEffective(effectiveType, metaType);
            const [tagBg, tagTx] = isCall ? (CALL_COLOR[callType ?? ''] ?? ['bg-green-50', 'text-green-700']) : [baseTagBg, baseTagTx];
            const tagIcon = isCall ? getCallIcon(callType) : getTypeIconByEffective(effectiveType, metaType);
            return (
              <div key={a.id} className="flex items-center gap-3">
                {/* Avatar người làm - màu theo tên, căn giữa dọc với box */}
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avBg} ${avTx} text-xs font-bold leading-none`}>
                  {getInitials(a.user?.name)}
                </div>
                {/* Nội dung */}
                <div className={`flex-1 min-w-0 rounded-lg border border-slate-100 ${cardBg} px-3 py-2`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{a.user?.name || '-'}</span>
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tagBg} ${tagTx} [&>svg]:h-3 [&>svg]:w-3`}>
                      {tagIcon}
                      {callLabel}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">
                      {formatDateTime(a.createdAt)}
                    </span>
                  </div>
                  {/* Cuộc gọi: chỉ hiện thời lượng gọn; loại khác hiện content */}
                  {isCall ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {callType === 'MISSED'
                        ? 'Không nghe máy'
                        : callDuration
                          ? `Thời lượng ${callDuration}`
                          : 'Đã kết nối'}
                    </p>
                  ) : a.content && (
                    <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{a.content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phân trang (chỉ hiện khi nhiều hơn 1 trang) */}
      {filtered.length > PER_PAGE && (
        <div className="flex items-center justify-between gap-2 mt-1 pt-4 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            Hiển thị {(safePage - 1) * PER_PAGE + 1}-{Math.min(safePage * PER_PAGE, filtered.length)} / {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 1}
              className="h-8 px-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ‹ Trước
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`h-8 w-8 rounded-lg text-sm font-medium ${
                  n === safePage ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage === totalPages}
              className="h-8 px-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Sau ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
