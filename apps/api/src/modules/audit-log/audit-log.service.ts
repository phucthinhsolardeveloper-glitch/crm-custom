import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { sanitize } from './audit-log.sanitizer';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

export interface CreateAuditLogParams {
  userId?: bigint | null;
  action: string;
  entityType?: string | null;
  entityId?: bigint | null;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persist one audit row. Caller controls "fire and forget" - service simply
   * logs DB errors instead of throwing so the calling interceptor can ignore
   * the promise without unhandled-rejection noise.
   */
  async create(params: CreateAuditLogParams): Promise<void> {
    try {
      const safeMetadata = params.metadata ? (sanitize(params.metadata) as Prisma.InputJsonValue) : undefined;
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId ?? null,
          action: params.action,
          entityType: params.entityType ?? null,
          entityId: params.entityId ?? null,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          method: params.method,
          path: params.path,
          statusCode: params.statusCode,
          metadata: safeMetadata,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Paginated query for /trace UI. Cursor on id (descending). */
  async query(filter: QueryAuditLogDto) {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const where = this.buildWhere(filter);

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: BigInt(filter.cursor) }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        userAgent: true,
        method: true,
        path: true,
        statusCode: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id.toString() : undefined;

    return {
      data: data.map((r) => ({
        id: r.id.toString(),
        userId: r.userId?.toString() ?? null,
        user: r.user
          ? {
              id: r.user.id.toString(),
              name: r.user.name,
              email: r.user.email,
              departmentName: r.user.department?.name ?? null,
            }
          : null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId?.toString() ?? null,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        method: r.method,
        path: r.path,
        statusCode: r.statusCode,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
      meta: { nextCursor },
    };
  }

  async findById(id: bigint) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id.toString(),
      userId: row.userId?.toString() ?? null,
      user: row.user
        ? {
            id: row.user.id.toString(),
            name: row.user.name,
            email: row.user.email,
            departmentName: row.user.department?.name ?? null,
          }
        : null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId?.toString() ?? null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  /** Distinct action names - feeds the filter dropdown. Cap to avoid huge payloads. */
  async listDistinctActions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      take: 200,
      orderBy: { action: 'asc' },
    });
    return rows.map((r) => r.action);
  }

  /** Hard-delete rows older than cutoff. Uses chunked DELETE to avoid long DB locks. */
  async pruneOldRecords(retentionDays = 60): Promise<{ auditDeleted: number; cronDeleted: number }> {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const auditDeleted = await this.chunkedDelete('audit_logs', cutoff);
    const cronDeleted = await this.chunkedDelete('cron_runs', cutoff);
    return { auditDeleted, cronDeleted };
  }

  private async chunkedDelete(table: 'audit_logs' | 'cron_runs', cutoff: Date): Promise<number> {
    let total = 0;
    let batch: number;
    do {
      // Raw DELETE with a sub-SELECT LIMIT is the safe Postgres pattern for
      // chunked deletes (no transaction needed; index-only scan on created_at).
       
      const sql =
        table === 'audit_logs'
          ? Prisma.sql`DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs WHERE created_at < ${cutoff} LIMIT 5000)`
          : Prisma.sql`DELETE FROM cron_runs WHERE id IN (SELECT id FROM cron_runs WHERE created_at < ${cutoff} LIMIT 5000)`;
      batch = await this.prisma.$executeRaw(sql);
      total += batch;
    } while (batch >= 5000);
    return total;
  }

  private buildWhere(filter: QueryAuditLogDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};

    if (filter.userId) where.userId = BigInt(filter.userId);
    if (filter.departmentId) {
      where.user = { departmentId: BigInt(filter.departmentId) };
    }
    if (filter.action) {
      const list = filter.action
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.action = list.length > 1 ? { in: list } : list[0];
    }
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.entityId) where.entityId = BigInt(filter.entityId);
    if (filter.method) where.method = filter.method;
    if (filter.statusCode) {
      const sc = filter.statusCode.toLowerCase();
      if (sc.endsWith('xx')) {
        const start = parseInt(sc[0], 10) * 100;
        where.statusCode = { gte: start, lt: start + 100 };
      } else {
        where.statusCode = parseInt(filter.statusCode, 10);
      }
    }
    if (filter.ipAddress) where.ipAddress = filter.ipAddress;
    if (filter.from || filter.to) {
      where.createdAt = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }
    return where;
  }
}
