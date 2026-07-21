import { serverFetch, getCurrentUser } from '@/lib/auth';
import type { PaymentRecord, NamedEntity, ApiListResponse } from '@/types/entities';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { OrderExportMenu } from '@/components/orders/order-export-menu';
import { OrderCsvImportDialog } from '@/components/orders/order-csv-import-dialog';
import { OrderImportHistoryDialog } from '@/components/orders/order-import-history-dialog';
import { OrderTableWithSettings } from '@/components/orders/order-table-with-settings';
import { PaymentFilterBar } from '@/components/orders/payment-filter-bar';

/** Orders page - payment-centric: mỗi dòng = 1 payment, order info auto-map. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = await searchParams;
  // Filter đa chọn -> 1 key nhiều giá trị (?status=A&status=B) -> Next trả string[].
  // KHÔNG dùng new URLSearchParams(params) trực tiếp: array bị join thành CSV "A,B" -> backend lỗi.
  const buildQp = () => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach((v) => q.append(key, v));
      else if (value !== undefined) q.append(key, value);
    }
    return q;
  };

  const qp = buildQp();
  qp.delete('cursor');
  // Payments endpoint dùng offset (total/totalPages) chỉ khi có `page` - mặc định page=1 cho PaginationControls.
  if (!qp.get('page')) qp.set('page', '1');
  const query = qp.toString();

  // Query cho export: bỏ phân trang để export đúng toàn bộ tập đang lọc.
  const exportQp = buildQp();
  exportQp.delete('cursor');
  exportQp.delete('page');
  exportQp.delete('limit');
  const exportQuery = exportQp.toString();

  const currentUser = await getCurrentUser();
  const isManagerPlus = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');

  let data: PaymentRecord[] = [];
  let meta: ApiListResponse<PaymentRecord>['meta'] = {};
  let paymentTypes: NamedEntity[] = [];
  let products: NamedEntity[] = [];
  let productGroups: NamedEntity[] = [];
  let users: NamedEntity[] = [];
  let teams: NamedEntity[] = [];

  const mapNamed = (list: NamedEntity[] = []) => list.map((x) => ({ id: String(x.id), name: x.name }));

  try {
    const [result, typesRes, productsRes, groupsRes, usersRes, teamsRes] = await Promise.all([
      serverFetch<ApiListResponse<PaymentRecord>>(`/payments?${query}`),
      serverFetch<{ data: NamedEntity[] }>('/payment-types').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/products?limit=500').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/product-groups').catch(() => ({ data: [] })),
      // Filter "Người tạo" + "Nhóm sale" chỉ co nghia voi MANAGER+ (USER chi thay data cua minh) -> chi fetch khi du quyen.
      isManagerPlus
        ? serverFetch<{ data: NamedEntity[] }>('/users').catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] as NamedEntity[] }),
      isManagerPlus
        ? serverFetch<{ data: NamedEntity[] }>('/teams').catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] as NamedEntity[] }),
    ]);
    data = result.data;
    meta = result.meta;
    paymentTypes = mapNamed(typesRes.data);
    products = mapNamed(productsRes.data);
    productGroups = mapNamed(groupsRes.data);
    users = mapNamed(usersRes.data);
    teams = mapNamed(teamsRes.data);
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Đơn hàng</h1>
          <p className="text-sm text-slate-500">Thanh toán theo đơn hàng - mỗi dòng = 1 lần thanh toán</p>
        </div>
        {isManagerPlus && (
          <div className="flex items-center gap-2">
            <OrderCsvImportDialog />
            <OrderImportHistoryDialog />
            <OrderExportMenu exportQuery={exportQuery} />
          </div>
        )}
      </div>

      <div className="mt-4">
        <PaymentFilterBar
          paymentTypes={paymentTypes}
          products={products}
          productGroups={productGroups}
          users={users}
          teams={teams}
          isManagerPlus={isManagerPlus}
        />
      </div>

      <div className="mt-4">
        <OrderTableWithSettings payments={data} totals={meta?.totals} />
      </div>
      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
