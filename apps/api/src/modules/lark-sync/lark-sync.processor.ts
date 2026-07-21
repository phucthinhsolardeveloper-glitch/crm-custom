import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { LarkTokenService } from './lark-token.service';
import { LarkBaseClient } from './lark-base.client';
import { LarkMappingEngine } from './lark-mapping-engine';
import { LarkMappingService } from './lark-mapping.service';
import { LarkSyncHistoryService } from './lark-sync-history.service';
import {
  LARK_SYNC_QUEUE,
  LARK_JOB_SYNC_PAYMENT,
  LARK_JOB_SYNC_REFUND,
  LARK_JOB_MARK_DELETED,
  LARK_DELETED_STATUS_LABEL,
} from './lark-sync.constants';
import type { SyncPaymentJobData, SyncRefundJobData, MarkDeletedJobData } from './lark-sync.service';

/** Catalog key cua cot trang thai payment trong fieldMap (xem lark-field-catalog). */
const STATUS_CATALOG_KEY = 'trangThaiPayment';

/**
 * BullMQ worker: 1 payment -> 1 record dung bang Lark theo LarkSyncMapping.
 *
 * Guard skip (return + log, KHONG retry):
 *   - Lark sync disabled (thieu env)
 *   - payment khong ton tai / da sync (larkSyncedAt != null)
 *   - don khong chon duong ong Lark (larkSyncId null)
 *   - duong ong da chon bi tat / khong ton tai
 *
 * Loi Lark API -> throw -> BullMQ retry exponential backoff.
 * Concurrency 1 de tranh rate-limit Bitable.
 */
@Processor(LARK_SYNC_QUEUE, { concurrency: 1 })
export class LarkSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(LarkSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: LarkTokenService,
    private readonly client: LarkBaseClient,
    private readonly engine: LarkMappingEngine,
    private readonly mappingService: LarkMappingService,
    private readonly history: LarkSyncHistoryService,
  ) {
    super();
  }

  async process(job: Job<SyncPaymentJobData | SyncRefundJobData | MarkDeletedJobData>): Promise<void> {
    if (!this.tokenService.isEnabled()) {
      this.logger.warn('Skip - Lark sync disabled (missing LARK_APP_ID/SECRET)');
      return;
    }

    if (job.name === LARK_JOB_SYNC_PAYMENT) {
      await this.handleSync((job.data as SyncPaymentJobData).paymentId);
    } else if (job.name === LARK_JOB_SYNC_REFUND) {
      await this.handleSyncRefund((job.data as SyncRefundJobData).refundId);
    } else if (job.name === LARK_JOB_MARK_DELETED) {
      await this.handleMarkDeleted(job.data as MarkDeletedJobData);
    } else {
      this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  /**
   * Upsert payment sang Lark: tao record neu chua co larkRecordId, update neu da co.
   * Goi luc create (PENDING) va moi lan doi status (verify/reject/refund).
   */
  private async handleSync(paymentIdStr: string): Promise<void> {
    const paymentId = BigInt(paymentIdStr);

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, orderId: true, larkRecordId: true },
    });
    if (!payment) {
      this.logger.warn(`Payment ${paymentId} not found - skip`);
      return;
    }

    const result = await this.engine.buildContext(paymentId);
    if (!result) {
      this.logger.warn(`Payment ${paymentId} context not buildable - skip`);
      return;
    }
    if (!result.larkSyncId) {
      this.logger.warn(`Payment ${paymentId} order has no Lark Sync selected - skip`);
      return;
    }

    const mapping = await this.mappingService.getEnabledById(result.larkSyncId);
    if (!mapping) {
      this.logger.log(
        `No enabled LarkSyncMapping ${result.larkSyncId} (payment ${paymentId}) - skip`,
      );
      return;
    }

    const fields = this.engine.applyMapping(mapping.fieldMap, result.ctx);
    const baseToken = mapping.baseToken ?? this.tokenService.getDefaultBaseToken();
    if (!baseToken) {
      this.logger.warn(`Payment ${paymentId} no baseToken (mapping null + env empty) - skip`);
      return;
    }

    // Loi o day throw -> BullMQ retry (token expired da duoc client invalidate).
    // Ghi nhat ky ket qua (best-effort) truoc khi throw lai de UI thay lan that bai cuoi.
    let recordId = payment.larkRecordId;
    try {
      if (recordId) {
        await this.client.updateRecord(baseToken, mapping.tableId, recordId, fields);
      } else {
        ({ recordId } = await this.client.createRecord(baseToken, mapping.tableId, fields));
      }
    } catch (err) {
      await this.history.recordResult({
        paymentId,
        orderId: payment.orderId,
        mappingId: mapping.id,
        channelName: mapping.name,
        tableId: mapping.tableId,
        status: 'FAILED',
        requestPayload: fields,
        larkResponse: err instanceof Error ? { message: err.message } : { error: String(err) },
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { larkSyncedAt: new Date(), larkRecordId: recordId },
    });
    await this.history.recordResult({
      paymentId,
      orderId: payment.orderId,
      mappingId: mapping.id,
      channelName: mapping.name,
      tableId: mapping.tableId,
      status: 'SUCCESS',
      requestPayload: fields,
      larkResponse: { recordId },
      larkRecordId: recordId,
    });
    this.logger.log(`Synced payment ${paymentId} -> table ${mapping.tableId} record ${recordId}`);
  }

  /**
   * Upsert 1 dong hoan tien (dien tay) sang Lark. Tao record neu chua co larkRecordId,
   * update neu da co. Tai dung nguyen catalog + fieldMap cua duong ong da chon.
   */
  private async handleSyncRefund(refundIdStr: string): Promise<void> {
    const refundId = BigInt(refundIdStr);

    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      select: { id: true, larkRecordId: true },
    });
    if (!refund) {
      this.logger.warn(`Refund ${refundId} not found - skip`);
      return;
    }

    const result = await this.engine.buildContextFromRefund(refundId);
    if (!result) {
      this.logger.warn(`Refund ${refundId} context not buildable - skip`);
      return;
    }
    if (!result.larkSyncId) {
      this.logger.warn(`Refund ${refundId} has no Lark Sync selected - skip`);
      return;
    }

    const mapping = await this.mappingService.getEnabledById(result.larkSyncId);
    if (!mapping) {
      this.logger.log(`No enabled LarkSyncMapping ${result.larkSyncId} (refund ${refundId}) - skip`);
      return;
    }

    const fields = this.engine.applyMapping(mapping.fieldMap, result.ctx);
    const baseToken = mapping.baseToken ?? this.tokenService.getDefaultBaseToken();
    if (!baseToken) {
      this.logger.warn(`Refund ${refundId} no baseToken (mapping null + env empty) - skip`);
      return;
    }

    // Loi Lark API throw -> BullMQ retry.
    let recordId = refund.larkRecordId;
    if (recordId) {
      await this.client.updateRecord(baseToken, mapping.tableId, recordId, fields);
    } else {
      ({ recordId } = await this.client.createRecord(baseToken, mapping.tableId, fields));
    }

    await this.prisma.refund.update({
      where: { id: refundId },
      data: { larkSyncedAt: new Date(), larkRecordId: recordId },
    });
    this.logger.log(`Synced refund ${refundId} -> table ${mapping.tableId} record ${recordId}`);
  }

  /**
   * Payment da bi xoa: giu dong tren Lark, chi update cot status sang "da xoa".
   * Khong rebuild context (payment khong con) - chi doi dung cot trang thai.
   */
  private async handleMarkDeleted(data: MarkDeletedJobData): Promise<void> {
    const mapping = await this.mappingService.getEnabledById(BigInt(data.larkSyncId));
    if (!mapping) {
      this.logger.log(`Mark-deleted: mapping ${data.larkSyncId} disabled/missing - skip`);
      return;
    }

    const baseToken = mapping.baseToken ?? this.tokenService.getDefaultBaseToken();
    if (!baseToken) {
      this.logger.warn(`Mark-deleted: no baseToken (record ${data.larkRecordId}) - skip`);
      return;
    }

    // Tim cot Lark dang map toi trang thai payment.
    const statusCol = Object.entries(mapping.fieldMap).find(
      ([, catalogKey]) => catalogKey === STATUS_CATALOG_KEY,
    )?.[0];
    if (!statusCol) {
      this.logger.log(`Mark-deleted: mapping ${data.larkSyncId} khong map cot status - skip`);
      return;
    }

    await this.client.updateRecord(baseToken, mapping.tableId, data.larkRecordId, {
      [statusCol]: LARK_DELETED_STATUS_LABEL,
    });
    this.logger.log(`Marked deleted on Lark record ${data.larkRecordId} -> "${LARK_DELETED_STATUS_LABEL}"`);
  }
}
