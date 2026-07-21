/**
 * Shared IDOR prevention utility.
 * Builds Prisma where-clause fragments based on user role to enforce data scoping.
 *
 * Usage:
 *   const where = { ...baseWhere, ...buildAccessFilter(user, 'lead') };
 *
 * Current rules:
 *   - SUPER_ADMIN / MANAGER: no filter (sees everything)
 *   - LEADER: self-scope like USER cho lead/customer/task. NGOẠI LỆ đơn hàng: LEADER có team
 *             xem được đơn của cả team (giám sát thuần đọc - mọi endpoint sửa/xóa order đều
 *             khóa MANAGER+ nên không có lỗ ghi). LEADER không team -> self-scope như USER.
 *   - USER: sees only data assigned to / created by them
 *
 * `mode` ('read' | 'write') giữ lại cho tương thích call-site; hiện không phân biệt hành vi
 * (order team-scope của LEADER an toàn vì không tồn tại endpoint ghi order cho LEADER).
 */
import { UserRole } from '@prisma/client';

export interface AccessFilterUser {
  id: bigint;
  role: UserRole;
  departmentId: bigint | null;
  teamId?: bigint | null;
}

type EntityType = 'lead' | 'order' | 'task' | 'customer' | 'refund';
type AccessMode = 'read' | 'write';

export function buildAccessFilter(
  user: AccessFilterUser,
  entity: EntityType,
  mode: AccessMode = 'read',
): Record<string, unknown> {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) {
    return {};
  }

  // LEADER giám sát ĐƠN HÀNG theo team (chỉ orders - lead/customer/task vẫn self-scope).
  // An toàn: mọi endpoint sửa/xóa order đều @Roles(MANAGER+), LEADER không có cửa ghi.
  if (user.role === UserRole.LEADER && user.teamId != null && entity === 'order') {
    return { creator: { teamId: user.teamId } };
  }

  // USER + LEADER (ngoài nhánh order team-scope trên): scoped to own data
  // (assigned to / created by chính mình). LEADER không team cũng rơi vào đây.
  switch (entity) {
    case 'lead':
      return { assignedUserId: user.id };
    case 'customer':
      return { assignedUserId: user.id };
    case 'order':
      return { createdBy: user.id };
    case 'refund':
      return { createdBy: user.id };
    case 'task':
      return { OR: [{ assignedTo: user.id }, { createdBy: user.id }] };
    default:
      return {};
  }
}
