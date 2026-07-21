import { Prisma, PaymentStatus } from '@prisma/client';

/**
 * Hai công thức doanh thu (tách biệt).
 *
 * - Doanh thu TỔNG (ví công ty): tiền thật đã về = VERIFIED + REJECTED.
 *   REJECTED = tiền có về nhưng sale nhập sai (vẫn là tiền của công ty).
 *   Dùng cho: dashboard tổng, doanh thu theo phòng ban / sản phẩm / nguồn, trend công ty.
 *
 * - Doanh số SALE (KPI): chỉ tiền sạch = VERIFIED.
 *   Dùng cho: leaderboard, podium, top-performers, employee-scores, KPI cá nhân của sale.
 *
 * Loại khỏi cả 2: PENDING (chưa duyệt), REFUNDED (đã trả lại), CANCELLED (tiền không về).
 *
 * Query role-conditional (1 query phục vụ cả admin lẫn user tự xem): admin -> TỔNG, user -> SALE.
 */

// Prisma-object queries: dùng `status: { in: [...] }`.
export const REVENUE_TOTAL_STATUSES: PaymentStatus[] = ['VERIFIED', 'REJECTED'];
export const REVENUE_SALE_STATUSES: PaymentStatus[] = ['VERIFIED'];

// Raw SQL ($queryRaw) - interpolate trực tiếp vào Prisma.sql. Alias payment = `p`.
export const SQL_REVENUE_TOTAL = Prisma.sql`p.status IN ('VERIFIED', 'REJECTED')`;
export const SQL_REVENUE_SALE = Prisma.sql`p.status = 'VERIFIED'`;
