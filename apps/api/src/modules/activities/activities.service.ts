import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma, EntityType, ActivityType } from '@prisma/client';

const ACTIVITY_SELECT = {
  id: true, entityType: true, entityId: true, userId: true,
  type: true, content: true, metadata: true, isPinned: true, createdAt: true,
  user: { select: { id: true, name: true } },
  attachments: { select: { id: true, fileName: true, fileUrl: true, fileType: true, fileSize: true } },
} satisfies Prisma.ActivitySelect;

const STATS_ACTIVITY_SELECT = {
  id: true, type: true, content: true, createdAt: true,
  user: {
    select: {
      id: true, name: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ActivitySelect;

interface DeptActivityItem {
  id: string;
  type: string;
  content: string | null;
  createdAt: Date;
  user: { id: string; name: string; departmentName: string | null } | null;
}

export interface DeptStatGroup {
  departmentId: string | null;
  departmentName: string;
  count: number;
  activities: DeptActivityItem[];
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Validate entity exists, throw 404 if not. */
  private async validateEntityExists(entityType: EntityType, entityId: bigint) {
    if (entityType === 'LEAD') {
      const lead = await this.prisma.lead.findFirst({ where: { id: entityId, deletedAt: null } });
      if (!lead) throw new NotFoundException('Không tìm thấy lead');
    } else if (entityType === 'CUSTOMER') {
      const customer = await this.prisma.customer.findFirst({ where: { id: entityId, deletedAt: null } });
      if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    }
  }

  /** Get paginated timeline for an entity. For CUSTOMER: aggregates from customer + all its leads. */
  async getTimeline(entityType: EntityType, entityId: bigint, limit = 20, cursor?: string, type?: ActivityType) {
    await this.validateEntityExists(entityType, entityId);
    const take = limit + 1;

    // Build where clause - for customers, include activities from all related leads
    let where: Prisma.ActivityWhereInput;
    if (entityType === 'CUSTOMER') {
      const leads = await this.prisma.lead.findMany({
        where: { customerId: entityId, deletedAt: null },
        select: { id: true },
      });
      const leadIds = leads.map(l => l.id);

      where = {
        deletedAt: null,
        ...(type ? { type } : {}),
        OR: [
          { entityType: 'CUSTOMER', entityId },
          ...(leadIds.length > 0 ? [{ entityType: 'LEAD' as EntityType, entityId: { in: leadIds } }] : []),
        ],
      };
    } else {
      where = { entityType, entityId, deletedAt: null, ...(type ? { type } : {}) };
    }

    const activities = await this.prisma.activity.findMany({
      where,
      select: ACTIVITY_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });

    const hasMore = activities.length > limit;
    const data = hasMore ? activities.slice(0, limit) : activities;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  /** Create a manual note. */
  async createNote(entityType: EntityType, entityId: bigint, userId: bigint, content: string) {
    await this.validateEntityExists(entityType, entityId);
    return this.prisma.activity.create({
      data: { entityType, entityId, userId, type: 'NOTE', content },
      select: ACTIVITY_SELECT,
    });
  }

  /** Get NOTE + CALL activity counts grouped by department for an entity. */
  async getStatsByDepartment(entityType: EntityType, entityId: bigint): Promise<{ data: DeptStatGroup[] }> {
    await this.validateEntityExists(entityType, entityId);

    // Build where - same entity expansion as getTimeline for CUSTOMER
    let where: Prisma.ActivityWhereInput;
    if (entityType === 'CUSTOMER') {
      const leads = await this.prisma.lead.findMany({
        where: { customerId: entityId, deletedAt: null },
        select: { id: true },
      });
      const leadIds = leads.map(l => l.id);
      where = {
        deletedAt: null,
        type: { in: ['NOTE', 'CALL'] as ActivityType[] },
        OR: [
          { entityType: 'CUSTOMER', entityId },
          ...(leadIds.length > 0 ? [{ entityType: 'LEAD' as EntityType, entityId: { in: leadIds } }] : []),
        ],
      };
    } else {
      where = { entityType, entityId, deletedAt: null, type: { in: ['NOTE', 'CALL'] as ActivityType[] } };
    }

    const activities = await this.prisma.activity.findMany({
      where,
      select: STATS_ACTIVITY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 500, // bounded to prevent memory issues on busy entities
    });

    // Group by department
    const groupMap = new Map<string, { departmentId: string | null; departmentName: string; items: typeof activities }>();

    for (const act of activities) {
      const dept = act.user?.department ?? null;
      const key = dept ? String(dept.id) : '__unknown__';
      const deptId = dept ? String(dept.id) : null;
      const deptName = dept ? dept.name : 'Không rõ PB';

      if (!groupMap.has(key)) {
        groupMap.set(key, { departmentId: deptId, departmentName: deptName, items: [] });
      }
      groupMap.get(key)!.items.push(act);
    }

    // Shape output - limit 20 activities per dept, sort by count desc
    const data: DeptStatGroup[] = Array.from(groupMap.values())
      .map(g => ({
        departmentId: g.departmentId,
        departmentName: g.departmentName,
        count: g.items.length,
        activities: g.items.slice(0, 20).map(a => ({
          id: String(a.id),
          type: a.type,
          content: a.content,
          createdAt: a.createdAt,
          user: a.user
            ? { id: String(a.user.id), name: a.user.name, departmentName: a.user.department?.name ?? null }
            : null,
        })),
      }))
      .sort((a, b) => b.count - a.count);

    return { data };
  }

  /** System auto-log activity (called by other modules). */
  async logActivity(params: {
    entityType: EntityType;
    entityId: bigint;
    userId: bigint;
    type: ActivityType;
    content?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.activity.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
        type: params.type,
        content: params.content,
        metadata: params.metadata as any,
      },
    });
  }
}
