import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { QueryCronRunDto } from './dto/query-cron-run.dto';
import { AUDIT_STATUS } from '../audit-log/audit-log.constants';

export interface CronRunContext {
  /** Mutable: number of rows the cron actually changed. */
  affected: number;
  /** Mutable: per-job custom data (e.g. breakdown by label). */
  metadata: Record<string, unknown>;
}

const STALE_RUNNING_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ERROR_BYTES = 8192;

@Injectable()
export class CronRunService implements OnModuleInit {
  private readonly logger = new Logger(CronRunService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * On boot, mark any RUNNING rows older than 30 min as FAILED - they belong
   * to a process that crashed before finishing. Without this, a stuck row
   * blocks dashboards forever.
   */
  async onModuleInit(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS);
      const result = await this.prisma.cronRun.updateMany({
        where: { status: AUDIT_STATUS.RUNNING, startedAt: { lt: cutoff } },
        data: {
          status: AUDIT_STATUS.FAILED,
          finishedAt: new Date(),
          errorMsg: 'Stale: server restarted during run',
        },
      });
      if (result.count > 0) {
        this.logger.warn(`Marked ${result.count} stale RUNNING cron rows as FAILED`);
      }
    } catch (err) {
      this.logger.error(`Stale cron cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Wrap a cron job body. Pre-inserts a RUNNING row, then updates to
   * SUCCESS / FAILED in `finally`. Re-throws so the caller can decide
   * whether to swallow or propagate the error.
   *
   * Failure to write the tracking row is logged but never blocks the cron -
   * the business logic always runs.
   */
  async track<T>(jobName: string, fn: (ctx: CronRunContext) => Promise<T>): Promise<T> {
    const ctx: CronRunContext = { affected: 0, metadata: {} };
    const startedAt = new Date();

    let runId: bigint | null = null;
    try {
      const row = await this.prisma.cronRun.create({
        data: { jobName, startedAt, status: AUDIT_STATUS.RUNNING },
        select: { id: true },
      });
      runId = row.id;
    } catch (err) {
      this.logger.error(`Could not create cron_runs row for ${jobName}: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const result = await fn(ctx);
      if (runId !== null) {
        await this.finishRow(runId, AUDIT_STATUS.SUCCESS, ctx);
      }
      return result;
    } catch (err) {
      if (runId !== null) {
        await this.finishRow(runId, AUDIT_STATUS.FAILED, ctx, err);
      }
      throw err;
    }
  }

  private async finishRow(
    id: bigint,
    status: 'SUCCESS' | 'FAILED',
    ctx: CronRunContext,
    error?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.cronRun.update({
        where: { id },
        data: {
          finishedAt: new Date(),
          status,
          affected: ctx.affected,
          metadata: ctx.metadata as Prisma.InputJsonValue,
          errorMsg: error ? this.formatError(error) : null,
        },
      });
    } catch (err) {
      this.logger.error(`Could not finalize cron_runs row ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Truncate stack traces to MAX_ERROR_BYTES so a JVM-style giant trace
   * doesn't bloat the audit table.
   */
  private formatError(err: unknown): string {
    let msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    // Defensive: strip anything that looks like a credential.
    msg = msg.replace(/(password|secret|token)\s*[:=]\s*\S+/gi, '$1=[REDACTED]');
    if (Buffer.byteLength(msg, 'utf8') > MAX_ERROR_BYTES) {
      msg = `${msg.slice(0, MAX_ERROR_BYTES)}\n...[truncated]`;
    }
    return msg;
  }

  async query(filter: QueryCronRunDto) {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const where: Prisma.CronRunWhereInput = {};

    if (filter.jobName) where.jobName = filter.jobName;
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
      where.startedAt = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }

    const rows = await this.prisma.cronRun.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: BigInt(filter.cursor) }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id.toString() : undefined;

    return {
      data: data.map((r) => this.toResponse(r)),
      meta: { nextCursor },
    };
  }

  async findById(id: bigint) {
    const row = await this.prisma.cronRun.findUnique({ where: { id } });
    return row ? this.toResponse(row) : null;
  }

  async listDistinctJobNames(): Promise<string[]> {
    const rows = await this.prisma.cronRun.findMany({
      select: { jobName: true },
      distinct: ['jobName'],
      take: 100,
      orderBy: { jobName: 'asc' },
    });
    return rows.map((r) => r.jobName);
  }

  private toResponse(r: {
    id: bigint;
    jobName: string;
    startedAt: Date;
    finishedAt: Date | null;
    status: string;
    affected: number;
    errorMsg: string | null;
    metadata: Prisma.JsonValue | null;
  }) {
    return {
      id: r.id.toString(),
      jobName: r.jobName,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      status: r.status,
      affected: r.affected,
      errorMsg: r.errorMsg,
      metadata: r.metadata,
      durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    };
  }
}
