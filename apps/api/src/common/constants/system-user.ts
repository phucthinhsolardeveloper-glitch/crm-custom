/**
 * User ID đại diện cho hệ thống khi không có actor con người.
 * Dùng cho: AUTO match payment (verifiedBy), activity log tự động.
 * ID 1 = tài khoản SUPER_ADMIN seed đầu tiên (tồn tại trên mọi môi trường).
 */
export const SYSTEM_USER_ID = BigInt(1);
