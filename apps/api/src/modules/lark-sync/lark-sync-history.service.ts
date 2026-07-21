import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, PrismaClient } from '@prisma/client';
import { ListLarkSyncHistoryQueryDto } from './dto/list-lark-sync-history-query.dto';

/** Giu lich su dong bo trong 30 ngay - cron don phan cu hon moc nay. */
const RETENTION_DAYS = 30;

/** Ket qua 1 lan worker chay xong (ghi/cap nhat 1 dong theo paymentId). */
export interface LarkSyncResultInput {
  paymentId: bigint;
  orderId: bigint | null;
  mappingId: bigint | null;
  channelName: string;
  tableId: string | null;
  status: 'SUCCESS' | 'FAILED';
  requestPayload?: Record<string, unknown> | null;
  larkResponse?: unknown;
  larkRecordId?: string | null;
  errorMessage?: string | null;
}

/**
 * Nhat ky dong bo payment -> Lark (1 dong/payment, luu ket qua moi nhat).
 * - recordResult: worker goi sau moi lan chay (upsert theo paymentId).
 * - list: doc lich su co phan trang + loc cho UI tab "Lich su dong bo".
 * - pruneOld: cron don log cu hon RETENTION_DAYS.
 */
@Injectable()
export class LarkSyncHistoryService {
  private readonly logger = new Logger(LarkSyncHistoryService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Ghi ket qua dong bo. Best-effort: loi ghi log chi log lai, KHONG throw
   * de khong lam vo flow sync (worker van retry theo loi Lark thuc su).
   * Upsert theo paymentId -> moi payment 1 dong, ket qua sau de len ket qua truoc.
   */
  async recordResult(input: LarkSyncResultInput): Promise<void> {
    const data = {
      orderId: input.orderId,
      mappingId: input.mappingId,
      channelName: input.channelName,
      tableId: input.tableId,
      status: input.status,
      requestPayload: (input.requestPayload ?? undefined) as Prisma.InputJsonValue | undefined,
      larkResponse: this.toJson(input.larkResponse),
      larkRecordId: input.larkRecordId ?? null,
      errorMessage: input.errorMessage ?? null,
      syncedAt: new Date(),
    };
    try {
      await this.prisma.larkSyncLog.upsert({
        where: { paymentId: input.paymentId },
        create: { paymentId: input.paymentId, ...data },
        update: data,
      });
    } catch (err) {
      this.logger.error(
        `Ghi lark_sync_log that bai (payment ${input.paymentId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Lich su co phan trang offset + loc theo trang thai / duong ong / tu khoa. */
  async list(query: ListLarkSyncHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.LarkSyncLogWhereInput = {};
    if (query.status === 'success') where.status = 'SUCCESS';
    else if (query.status === 'failed') where.status = 'FAILED';
    if (query.mappingId && /^\d+$/.test(query.mappingId)) {
      where.mappingId = BigInt(query.mappingId);
    }
    const search = query.search?.trim();
    if (search) {
      const or: Prisma.LarkSyncLogWhereInput[] = [
        { larkRecordId: { contains: search, mode: 'insensitive' } },
        { channelName: { contains: search, mode: 'insensitive' } },
      ];
      if (/^\d+$/.test(search)) {
        or.push({ paymentId: BigInt(search) }, { orderId: BigInt(search) });
      }
      where.OR = or;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.larkSyncLog.findMany({
        where,
        orderBy: { syncedAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.larkSyncLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Don log cu hon 30 ngay - hang ngay 3:15 sang (truoc audit-retention 3:30). */
  @Cron('15 3 * * *')
  async pruneOld(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
      const { count } = await this.prisma.larkSyncLog.deleteMany({
        where: { syncedAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(`Da don ${count} lark_sync_log cu hon ${RETENTION_DAYS} ngay`);
      }
    } catch (err) {
      this.logger.error(
        `Cron don lark_sync_log that bai: ${err instanceof Error ? err.stack : String(err)}`,
      );
    }
  }

  /** Ep gia tri ve JSON luu duoc (null -> bo cot, object/array giu nguyen). */
  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined;
    return value as Prisma.InputJsonValue;
  }
}
