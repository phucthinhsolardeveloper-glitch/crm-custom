import Link from 'next/link';
import { ChevronRight, Pencil } from 'lucide-react';
import { CreateOrderFlowButton } from '@/components/orders/create-order-flow-button';
import type { CustomerRecord, ProductRecord, NamedEntity } from '@/types/entities';
import { getCustomerTabLabel, type CustomerTabKey } from '@/lib/customer-tabs';

interface Props {
  customer: CustomerRecord;
  activeTab: CustomerTabKey;
  /** Không còn dùng - CreateOrderDialog tự fetch. Giữ để không break caller. */
  products?: ProductRecord[];
  paymentTypes?: NamedEntity[];
}

// Page header phẳng (không card wrapper) để tránh card-lồng-card khi content bên dưới
// đã có cards. Breadcrumb -> title -> actions trên cùng một hàng.
export function CustomerTopStrip({ customer, activeTab }: Props) {
  const tabTitle = getCustomerTabLabel(activeTab);
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <div className="min-w-0">
        <nav className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
          <Link href="/customers" className="text-sky-600 hover:underline font-medium">
            Khách hàng
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <span className="truncate text-slate-600">{customer.name}</span>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <span className="text-slate-400">{tabTitle}</span>
        </nav>
        <h1 className="text-xl lg:text-2xl font-extrabold text-slate-900 leading-tight">
          {tabTitle}
        </h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/customers/${customer.id}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          <Pencil className="h-4 w-4" />
          Sửa
        </Link>
        {/* Flow: khách còn đơn chưa TT đủ -> hỏi thêm TT cho đơn cũ hay tạo đơn mới */}
        <CreateOrderFlowButton
          customerId={customer.id}
          defaultCustomerName={customer.name ?? undefined}
          defaultCustomerPhone={customer.phone ?? undefined}
        />
      </div>
    </div>
  );
}
