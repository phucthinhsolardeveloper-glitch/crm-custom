/** Một dòng trong list revenue-by-product. Có thể là 1 product cụ thể hoặc nhóm "Other". */
export interface RevenueByProductItem {
  /** ID product. `null` cho dòng tổng hợp "Other" (top N+ products gộp lại). */
  productId: string | null;
  /** Tên product hoặc "Khác (N sản phẩm)" cho dòng Other. */
  name: string;
  /** Tổng doanh thu (VND) tính từ orders COMPLETED. */
  revenue: number;
  /** Số đơn hàng đóng góp vào revenue này. */
  orders: number;
  /** Tỉ trọng so với tổng tất cả products (0-100). */
  percent: number;
}

export interface RevenueByProductResponse {
  products: RevenueByProductItem[];
  /** Tổng doanh thu tất cả products của KH này. */
  totalRevenue: number;
  /** % thay đổi so với 3 tháng trước (null nếu không đủ data). */
  deltaPercent: number | null;
}
