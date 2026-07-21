/**
 * CRM_FIELD_CATALOG - "hop dong du lieu" co dinh giua CRM va Lark sync.
 *
 * Moi entry: catalogKey -> { label, type, resolve(ctx) }.
 * Admin chi map "Cot Lark" -> catalogKey qua UI (LarkSyncMapping.fieldMap);
 * them base/bang moi KHONG can sua code. Them field xuat duoc = them entry o day.
 *
 * Kieu gia tri gui sang Lark:
 *   - date   -> epoch milliseconds (Lark Date field)
 *   - number -> number
 *   - string -> string (cot User/Select ben Lark da doi sang Text)
 */

import type { PaymentStatus } from '@prisma/client';

export type LarkFieldType = 'string' | 'number' | 'date';

/** Aggregate tinh tu cac payment cua order (xem lark-mapping-engine). */
export interface LarkSyncAgg {
  /** Thu tu lan thanh toan cua payment nay trong order (1-based). */
  sequence: number;
  /** Tong tien tat ca cac lan thanh toan cua order. */
  paidTotal: number;
}

/** Context da chuan hoa (Decimal -> number) do engine build tu DB. */
export interface LarkSyncContext {
  payment: {
    id: string;
    amount: number;
    transferDate: Date | null;
    createdAt: Date;
    transferContent: string | null;
    status: PaymentStatus;
  };
  order: {
    totalAmount: number;
    vatRate: number;
    courseCode: string | null;
    stt: string | null;
    customerName: string | null;
    customerPhone: string | null;
    address: string | null;
    notes: string | null;
    companyName: string | null;
    taxCode: string | null;
    vatEmail: string | null;
  };
  customer: { name: string; phone: string } | null;
  product: { name: string; price: number } | null;
  productGroup: { name: string } | null;
  orderFormat: { name: string } | null;
  leadSource: { name: string } | null;
  creator: { name: string } | null;
  team: { name: string } | null;
  paymentType: { name: string } | null;
  bankAccount: { name: string } | null;
  installment: { name: string } | null;
  agg: LarkSyncAgg;
}

export interface LarkCatalogEntry {
  label: string;
  type: LarkFieldType;
  resolve: (ctx: LarkSyncContext) => string | number | Date | null | undefined;
}

/** Nhan tieng Viet cho 5 trang thai payment - day sang cot "TINH TRANG TT" ben Lark. */
const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Chờ duyệt',
  VERIFIED: 'Đã thanh toán',
  REJECTED: 'Sai (đã CK)',
  REFUNDED: 'Hoàn tiền',
  CANCELLED: 'Huỷ',
};

export const CRM_FIELD_CATALOG: Record<string, LarkCatalogEntry> = {
  ngay: {
    label: 'Ngày (ngày TT, fallback ngày tạo)',
    type: 'date',
    resolve: (c) => c.payment.transferDate ?? c.payment.createdAt,
  },
  ngayTT: {
    label: 'Ngày thanh toán',
    type: 'date',
    resolve: (c) => c.payment.transferDate ?? c.payment.createdAt,
  },
  nhanVien: {
    label: 'Nhân viên (người tạo payment, fallback người tạo đơn)',
    type: 'string',
    resolve: (c) => c.creator?.name,
  },
  team: { label: 'Team của nhân viên', type: 'string', resolve: (c) => c.team?.name },
  nhomSP: { label: 'Nhóm sản phẩm', type: 'string', resolve: (c) => c.productGroup?.name },
  nguon: { label: 'Nguồn lead', type: 'string', resolve: (c) => c.leadSource?.name ?? '' },
  khoa: { label: 'Mã khoá', type: 'string', resolve: (c) => c.order.courseCode },
  stt: { label: 'STT', type: 'string', resolve: (c) => c.order.stt },
  // STT co tien to "NGAY " - dung cho cot dang "NGAY 1".."NGAY 7" (input order.stt chi nhap so).
  sttNgay: {
    label: 'STT (dạng "NGÀY n")',
    type: 'string',
    resolve: (c) => (c.order.stt ? `NGÀY ${c.order.stt}` : null),
  },
  hinhThucToChuc: {
    label: 'Hình thức tổ chức',
    type: 'string',
    resolve: (c) => c.orderFormat?.name,
  },
  tenKhach: {
    label: 'Tên khách',
    type: 'string',
    resolve: (c) => c.order.customerName ?? c.customer?.name,
  },
  sdt: {
    // Gui dang number de khop cot So cua bang Lark. Danh doi: mat so 0 dau
    // ("0343..." -> 343...) vi kieu so khong giu duoc so 0 dau. Chap nhan theo quyet dinh nghiep vu.
    label: 'Số điện thoại khách',
    type: 'number',
    resolve: (c) => c.order.customerPhone ?? c.customer?.phone,
  },
  diaChi: { label: 'Địa chỉ khách', type: 'string', resolve: (c) => c.order.address },
  tenSP: { label: 'Tên sản phẩm', type: 'string', resolve: (c) => c.product?.name },
  giaNiemYet: { label: 'Giá bán niêm yết', type: 'number', resolve: (c) => c.product?.price },
  soTien: {
    label: 'Số tiền lần TT này (doanh thu về cty)',
    type: 'number',
    resolve: (c) => c.payment.amount,
  },
  vatRate: { label: '% VAT', type: 'number', resolve: (c) => c.order.vatRate },
  soLanTT: {
    label: 'Số lần TT ("Lần 1"/"Lần 2"...)',
    type: 'string',
    resolve: (c) => `Lần ${c.agg.sequence}`,
  },
  tinhTrangTT: {
    label: 'Tình trạng TT ("Chưa thanh toán")',
    type: 'string',
    // Sync chay luc tao payment (PENDING - chua duyet) nen trang thai ban dau luon "Chua thanh toan".
    // Khop option SingleSelect cua bang Lark; ke toan xac nhan rieng qua cot "KE TOAN XAC NHAN".
    // Ban ghi khong re-sync sau khi duyet nen gia tri nay co dinh tai thoi diem tao.
    resolve: () => 'Chưa thanh toán',
  },
  // Trang thai cua chinh payment nay - cap nhat lai Lark moi lan doi status (verify/reject/refund).
  trangThaiPayment: {
    label: 'Trạng thái payment (Chờ duyệt/Đã thanh toán...)',
    type: 'string',
    resolve: (c) => PAYMENT_STATUS_LABELS[c.payment.status] ?? c.payment.status,
  },
  hinhThucTT: { label: 'Hình thức thanh toán', type: 'string', resolve: (c) => c.paymentType?.name },
  nganHang: { label: 'Ngân hàng nhận', type: 'string', resolve: (c) => c.bankAccount?.name },
  maGD: { label: 'Mã GD (nội dung CK)', type: 'string', resolve: (c) => c.payment.transferContent },
  ghiChu: { label: 'Ghi chú đơn hàng', type: 'string', resolve: (c) => c.order.notes },
  phanLoaiTT: { label: 'Phân loại TT (đợt CK)', type: 'string', resolve: (c) => c.installment?.name },
  tenCongTy: { label: 'Tên công ty', type: 'string', resolve: (c) => c.order.companyName },
  mst: { label: 'Mã số thuế', type: 'string', resolve: (c) => c.order.taxCode },
  email: { label: 'Email nhận VAT', type: 'string', resolve: (c) => c.order.vatEmail },
  // Audit/dedupe: map vao 1 cot Lark de doi soat va phat hien ghi trung
  // (truong hop hiem: worker crash giua create record va luu larkSyncedAt -> retry tao dong 2)
  maPayment: {
    label: 'Mã payment CRM (audit/chống trùng)',
    type: 'string',
    resolve: (c) => c.payment.id,
  },
};

/** Danh sach key hop le - dung de validate fieldMap va render dropdown UI. */
export const CRM_FIELD_CATALOG_KEYS = Object.keys(CRM_FIELD_CATALOG);

/** Shape tra ve cho UI dropdown (GET /lark-sync/catalog). */
export function listCatalogEntries(): Array<{ key: string; label: string; type: LarkFieldType }> {
  return Object.entries(CRM_FIELD_CATALOG).map(([key, e]) => ({
    key,
    label: e.label,
    type: e.type,
  }));
}
