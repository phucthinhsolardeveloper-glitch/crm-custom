import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { REVENUE_TOTAL_STATUSES } from '../../common/constants/revenue-filter';

/** Shared read-only query service for both MCP tools and REST /ai-agent/ endpoints */
@Injectable()
export class McpAgentQueryService {
  constructor(private readonly prisma: PrismaClient) {}

  async searchLeads(params: {
    search?: string; status?: string; departmentId?: string; userId?: string;
    sourceId?: string; labelId?: string; dateFrom?: string; dateTo?: string;
    limit?: number; cursor?: string;
  }) {
    const limit = Math.min(params.limit ?? 20, 100);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.departmentId) where.departmentId = BigInt(params.departmentId);
    if (params.userId) where.assignedUserId = BigInt(params.userId);
    if (params.sourceId) where.sourceId = BigInt(params.sourceId);
    if (params.labelId) where.labels = { some: { labelId: BigInt(params.labelId) } };
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo ? { lte: new Date(params.dateTo + 'T23:59:59Z') } : {}),
      };
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const select = {
      id: true, phone: true, name: true, email: true, status: true,
      companyName: true, createdAt: true, updatedAt: true,
      customer: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      source: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      labels: { include: { label: { select: { id: true, name: true, color: true, textColor: true } } } },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findArgs: any = { where, select, orderBy: { id: 'desc' }, take: limit + 1 };
    if (params.cursor) { findArgs.skip = 1; findArgs.cursor = { id: BigInt(params.cursor) }; }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany(findArgs),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.prisma.lead.count({ where: where as any }),
    ]);

    const hasMore = leads.length > limit;
    const data = hasMore ? leads.slice(0, limit) : leads;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nextCursor = hasMore && data.length > 0 ? String((data[data.length - 1] as any).id) : undefined;
    return { data, total, hasMore, nextCursor };
  }

  async getLeadDetail(id: string) {
    const lead = await this.prisma.lead.findFirst({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { id: BigInt(id), deletedAt: null } as any,
      select: {
        id: true, phone: true, name: true, email: true, status: true,
        companyName: true, facebookUrl: true, instagramUrl: true, zaloUrl: true, linkedinUrl: true,
        metadata: true, customerId: true, productId: true, sourceId: true,
        assignedUserId: true, departmentId: true, createdAt: true, updatedAt: true,
        customer: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        source: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        label: { select: { id: true, name: true, color: true, textColor: true } },
        orders: {
          where: { deletedAt: null },
          select: {
            id: true, status: true, totalAmount: true, createdAt: true,
            product: { select: { name: true } },
            payments: { select: { id: true, amount: true, status: true, createdAt: true } },
          },
          orderBy: { id: 'desc' as const }, take: 10,
        },
      },
    });
    if (!lead) return null;

    const activities = await this.prisma.activity.findMany({
      where: { entityType: 'LEAD', entityId: BigInt(id) },
      select: { id: true, type: true, content: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { id: 'desc' }, take: 10,
    });

    return { lead, recentActivities: activities };
  }

  async searchCustomers(params: {
    search?: string; status?: string; departmentId?: string; userId?: string;
    labelId?: string; dateFrom?: string; dateTo?: string;
    limit?: number; cursor?: string;
  }) {
    const limit = Math.min(params.limit ?? 20, 100);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.departmentId) where.assignedDepartmentId = BigInt(params.departmentId);
    if (params.userId) where.assignedUserId = BigInt(params.userId);
    if (params.labelId) where.labels = { some: { labelId: BigInt(params.labelId) } };
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo ? { lte: new Date(params.dateTo + 'T23:59:59Z') } : {}),
      };
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const select = {
      id: true, phone: true, name: true, email: true, companyName: true,
      shortDescription: true, aiRating: true, status: true, createdAt: true, updatedAt: true,
      assignedUser: { select: { id: true, name: true } },
      assignedDepartment: { select: { id: true, name: true } },
      labels: { include: { label: { select: { id: true, name: true, color: true, textColor: true } } } },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findArgs: any = { where, select, orderBy: { id: 'desc' }, take: limit + 1 };
    if (params.cursor) { findArgs.skip = 1; findArgs.cursor = { id: BigInt(params.cursor) }; }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany(findArgs),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.prisma.customer.count({ where: where as any }),
    ]);

    const hasMore = customers.length > limit;
    const data = hasMore ? customers.slice(0, limit) : customers;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nextCursor = hasMore && data.length > 0 ? String((data[data.length - 1] as any).id) : undefined;
    return { data, total, hasMore, nextCursor };
  }

  async searchOrders(params: {
    search?: string; status?: string; productId?: string; createdBy?: string;
    customerId?: string; dateFrom?: string; dateTo?: string;
    limit?: number; cursor?: string;
  }) {
    const limit = Math.min(params.limit ?? 20, 100);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.productId) where.productId = BigInt(params.productId);
    if (params.createdBy) where.createdBy = BigInt(params.createdBy);
    if (params.customerId) where.customerId = BigInt(params.customerId);
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo ? { lte: new Date(params.dateTo + 'T23:59:59Z') } : {}),
      };
    }
    if (params.search) {
      where.OR = [
        { customerName: { contains: params.search, mode: 'insensitive' } },
        { customerPhone: { contains: params.search } },
        { courseCode: { contains: params.search, mode: 'insensitive' } },
        { customer: { name: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const select = {
      id: true, status: true, totalAmount: true, amount: true,
      vatRate: true, vatAmount: true, customerName: true, customerPhone: true,
      createdAt: true, updatedAt: true,
      customer: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findArgs: any = { where, select, orderBy: { id: 'desc' }, take: limit + 1 };
    if (params.cursor) { findArgs.skip = 1; findArgs.cursor = { id: BigInt(params.cursor) }; }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany(findArgs),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.prisma.order.count({ where: where as any }),
    ]);

    const hasMore = orders.length > limit;
    const data = hasMore ? orders.slice(0, limit) : orders;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nextCursor = hasMore && data.length > 0 ? String((data[data.length - 1] as any).id) : undefined;
    return { data, total, hasMore, nextCursor };
  }

  async getStats(params: { dateFrom?: string; dateTo?: string; departmentId?: string }) {
    const now = new Date();
    const from = params.dateFrom ? new Date(params.dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = params.dateTo ? new Date(params.dateTo + 'T23:59:59Z') : now;
    const dateRange = { gte: from, lte: to };
    const deptFilter: Record<string, unknown> = params.departmentId
      ? { departmentId: BigInt(params.departmentId) } : {};

    const [newLeads, inProgress, converted, revenueAgg, newCustomers, totalOrders, pendingPayments, overdueTasks] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.prisma.lead.count({ where: { deletedAt: null, ...deptFilter, status: 'POOL', createdAt: dateRange } as any }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.prisma.lead.count({ where: { deletedAt: null, ...deptFilter, status: 'IN_PROGRESS' } as any }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.prisma.lead.count({ where: { deletedAt: null, ...deptFilter, status: 'CONVERTED', updatedAt: dateRange } as any }),
      // Doanh thu TONG (VERIFIED+REJECTED) - MCP query service la admin-only (vi cong ty).
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: REVENUE_TOTAL_STATUSES },
          verifiedAt: dateRange,
          order: { deletedAt: null },
        },
      }),
      this.prisma.customer.count({ where: { deletedAt: null, createdAt: dateRange } }),
      this.prisma.order.count({ where: { deletedAt: null, createdAt: dateRange } }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.task.count({ where: { deletedAt: null, status: 'PENDING', dueDate: { lt: now } } }),
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      kpis: {
        newLeads, inProgress, converted,
        revenue: Number(revenueAgg._sum.amount ?? 0),
        newCustomers, totalOrders, pendingPayments, overdueTasks,
      },
    };
  }
}
