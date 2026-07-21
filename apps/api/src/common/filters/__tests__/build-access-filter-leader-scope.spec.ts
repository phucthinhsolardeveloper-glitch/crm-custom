import { describe, expect, it } from 'vitest';
import { UserRole } from '@prisma/client';
import { buildAccessFilter, type AccessFilterUser } from '../build-access-filter';

/**
 * Phân quyền data-scoping cho role LEADER.
 * LEADER self-scope như USER cho lead/customer/task (chỉ data của chính mình).
 * NGOẠI LỆ đơn hàng: LEADER có team xem đơn của cả team ({ creator: { teamId } }).
 * Đây là cổng chống IDOR chính: assert KHÔNG trả {} (thấy toàn hệ thống);
 * lead/customer/task KHÔNG lộ theo team; order team-scope chỉ khi LEADER có team.
 */
const LEADER_WITH_TEAM: AccessFilterUser = {
  id: 7n,
  role: UserRole.LEADER,
  departmentId: 3n,
  teamId: 5n,
};

const LEADER_NO_TEAM: AccessFilterUser = {
  id: 8n,
  role: UserRole.LEADER,
  departmentId: 3n,
  teamId: null,
};

describe('buildAccessFilter - LEADER có team: order theo team, còn lại self-scope', () => {
  it('lead: chỉ lead của chính mình', () => {
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'lead')).toEqual({ assignedUserId: 7n });
  });

  it('customer: chỉ KH của chính mình', () => {
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'customer')).toEqual({ assignedUserId: 7n });
  });

  it('order: xem đơn của cả team (ngoại lệ)', () => {
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'order')).toEqual({ creator: { teamId: 5n } });
  });

  it('task: assigned hoặc created bởi mình', () => {
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'task')).toEqual({
      OR: [{ assignedTo: 7n }, { createdBy: 7n }],
    });
  });

  it('không bao giờ trả {} (thấy toàn hệ thống) cho LEADER', () => {
    for (const entity of ['lead', 'customer', 'order', 'task'] as const) {
      expect(buildAccessFilter(LEADER_WITH_TEAM, entity)).not.toEqual({});
    }
  });

  it('lead/customer/task KHÔNG lộ theo team (chỉ order mới team-scope)', () => {
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'lead')).not.toHaveProperty('OR');
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'customer')).not.toEqual({
      assignedUser: { teamId: 5n },
    });
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'task')).not.toHaveProperty('creator');
  });
});

describe('buildAccessFilter - LEADER self-scope ở mode write (giống read)', () => {
  it('lead write: chỉ lead của chính mình', () => {
    expect(buildAccessFilter(LEADER_WITH_TEAM, 'lead', 'write')).toEqual({ assignedUserId: 7n });
  });

  it('write === read (LEADER self-scope ở cả 2 mode)', () => {
    for (const entity of ['lead', 'customer', 'order', 'task'] as const) {
      expect(buildAccessFilter(LEADER_WITH_TEAM, entity, 'write')).toEqual(
        buildAccessFilter(LEADER_WITH_TEAM, entity, 'read'),
      );
    }
  });
});

describe('buildAccessFilter - LEADER không team self-scope', () => {
  it('lead/customer: chỉ data của chính mình', () => {
    expect(buildAccessFilter(LEADER_NO_TEAM, 'lead')).toEqual({ assignedUserId: 8n });
    expect(buildAccessFilter(LEADER_NO_TEAM, 'customer')).toEqual({ assignedUserId: 8n });
  });

  it('order: chỉ đơn mình tạo', () => {
    expect(buildAccessFilter(LEADER_NO_TEAM, 'order')).toEqual({ createdBy: 8n });
  });

  it('task: assigned hoặc created bởi mình', () => {
    expect(buildAccessFilter(LEADER_NO_TEAM, 'task')).toEqual({
      OR: [{ assignedTo: 8n }, { createdBy: 8n }],
    });
  });
});

describe('buildAccessFilter - MANAGER/SUPER_ADMIN không bị scope', () => {
  it('MANAGER thấy tất cả (filter rỗng)', () => {
    const mgr: AccessFilterUser = { id: 2n, role: UserRole.MANAGER, departmentId: null, teamId: null };
    expect(buildAccessFilter(mgr, 'lead')).toEqual({});
  });

  it('SUPER_ADMIN thấy tất cả (filter rỗng)', () => {
    const sa: AccessFilterUser = { id: 1n, role: UserRole.SUPER_ADMIN, departmentId: null, teamId: null };
    expect(buildAccessFilter(sa, 'order')).toEqual({});
  });
});
