'use client';

/** Kiểu dữ liệu + các bảng con cho màn chi tiết 1 đợt import đơn hàng. */

export interface ImportBatch {
  id: string;
  fileName: string;
  totalRows: number;
  createdCount: number;
  newOrders: number;
  newCustomers: number;
  errorCount: number;
  createdAt: string;
  uploader?: { id: string; name: string };
}

export interface ImportBatchError {
  row: number;
  phone: string;
  reason: string;
}

export interface ImportBatchPayment {
  id: string;
  amount: string;
  status: string;
  transferDate: string | null;
  createdAt: string;
  order: {
    id: string;
    customerName: string | null;
    customerPhone: string | null;
    product: { name: string } | null;
  };
}

export interface ImportBatchDetail extends ImportBatch {
  errors: ImportBatchError[] | null;
  payments: ImportBatchPayment[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Từ chối',
  REFUNDED: 'Hoàn tiền',
  CANCELLED: 'Đã huỷ',
};

/** 4 ô số liệu tổng hợp của đợt import. */
export function ImportBatchSummaryCards({ batch }: { batch: ImportBatchDetail }) {
  const items = [
    { label: 'Tổng dòng', value: batch.totalRows, cls: 'text-slate-800' },
    { label: 'Tạo được', value: batch.createdCount, cls: 'text-emerald-600' },
    { label: 'Đơn mới', value: batch.newOrders, cls: 'text-sky-600' },
    { label: 'Lỗi', value: batch.errorCount, cls: batch.errorCount > 0 ? 'text-red-600' : 'text-slate-400' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-md border border-slate-200 p-2 text-center">
          <div className={`text-lg font-bold ${it.cls}`}>{it.value}</div>
          <div className="text-xs text-slate-500">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Bảng các dòng lỗi (bị bỏ qua) trong đợt import. */
export function ImportBatchErrorTable({ errors }: { errors: ImportBatchError[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium text-red-700">Dòng lỗi (đã bỏ qua)</h4>
      <div className="max-h-48 overflow-auto rounded border border-red-100">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-red-50 text-red-700">
            <tr>
              <th className="px-2 py-1 text-left">Dòng</th>
              <th className="px-2 py-1 text-left">SĐT</th>
              <th className="px-2 py-1 text-left">Lý do</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e, i) => (
              <tr key={i} className="border-t border-red-50">
                <td className="px-2 py-1">{e.row}</td>
                <td className="px-2 py-1">{e.phone || '-'}</td>
                <td className="px-2 py-1 text-slate-700">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Bảng các payment đã tạo trong đợt import. */
export function ImportBatchPaymentTable({ payments }: { payments: ImportBatchPayment[] }) {
  if (!payments || payments.length === 0) {
    return <p className="text-sm text-slate-500">Đợt này không tạo được payment nào.</p>;
  }
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium text-slate-700">Payment đã tạo ({payments.length})</h4>
      <div className="max-h-64 overflow-auto rounded border border-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Mã đơn</th>
              <th className="px-2 py-1 text-left">Khách hàng</th>
              <th className="px-2 py-1 text-left">SĐT</th>
              <th className="px-2 py-1 text-left">Sản phẩm</th>
              <th className="px-2 py-1 text-right">Số tiền</th>
              <th className="px-2 py-1 text-left">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-2 py-1">
                  <a href={`/orders/${p.order.id}`} className="text-sky-600 hover:underline">#{p.order.id}</a>
                </td>
                <td className="px-2 py-1 max-w-[140px] truncate">{p.order.customerName ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{p.order.customerPhone ?? '-'}</td>
                <td className="px-2 py-1 max-w-[160px] truncate">{p.order.product?.name ?? '-'}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{formatVnd(p.amount)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{STATUS_LABEL[p.status] ?? p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 1.000.000 (VND, không lẻ) theo chuẩn hiển thị của dự án. */
function formatVnd(amount: string | number): string {
  return Number(amount).toLocaleString('vi-VN');
}
