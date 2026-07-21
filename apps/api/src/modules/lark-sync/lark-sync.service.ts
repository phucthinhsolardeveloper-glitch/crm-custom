import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  LARK_SYNC_QUEUE,
  LARK_JOB_SYNC_PAYMENT,
  LARK_JOB_SYNC_REFUND,
  LARK_JOB_MARK_DELETED,
  LARK_RETRY_ATTEMPTS,
  LARK_RETRY_BACKOFF_MS,
} from './lark-sync.constants';

/** Payload job sync payment. String (khong BigInt) vi BullMQ serialize JSON. */
export interface SyncPaymentJobData {
  paymentId: string;
}

/** Payload job sync refund (dong hoan tien dien tay). */
export interface SyncRefundJobData {
  refundId: string;
}

/** Payload job danh dau record Lark cua payment da bi xoa. */
export interface MarkDeletedJobData {
  larkRecordId: string;
  larkSyncId: string;
}

const JOB_OPTS = {
  attempts: LARK_RETRY_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: LARK_RETRY_BACKOFF_MS },
  removeOnComplete: { age: 3600, count: 500 },
  removeOnFail: { age: 86400 },
};

/**
 * Enqueue job day payment sang Lark Base (upsert: tao luc create, update khi doi status).
 * jobId = `pay-{id}-{event}` -> moi loai thay doi (create/verify/reject/refund) chay rieng,
 * lap lai cung event trong queue window thi dedupe. Processor upsert theo larkRecordId.
 */
@Injectable()
export class LarkSyncService {
  private readonly logger = new Logger(LarkSyncService.name);

  constructor(
    @InjectQueue(LARK_SYNC_QUEUE)
    private readonly queue: Queue<SyncPaymentJobData | SyncRefundJobData | MarkDeletedJobData>,
  ) {}

  /** Best-effort: day 1 dong hoan tien sang Lark. Loi enqueue chi log, KHONG throw. */
  async enqueueRefundSync(refundId: string, event = 'create'): Promise<void> {
    try {
      await this.queue.add(
        LARK_JOB_SYNC_REFUND,
        { refundId },
        { jobId: `refund-${refundId}-${event}`, ...JOB_OPTS },
      );
      this.logger.log(`Enqueued lark-sync (${event}) for refund ${refundId}`);
    } catch (err) {
      this.logger.error(
        `Enqueue lark-sync failed for refund ${refundId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Best-effort: loi enqueue chi log, KHONG throw ra flow goi. */
  async enqueuePaymentSync(paymentId: string, event = 'sync'): Promise<void> {
    try {
      await this.queue.add(
        LARK_JOB_SYNC_PAYMENT,
        { paymentId },
        { jobId: `pay-${paymentId}-${event}`, ...JOB_OPTS },
      );
      this.logger.log(`Enqueued lark-sync (${event}) for payment ${paymentId}`);
    } catch (err) {
      this.logger.error(
        `Enqueue lark-sync failed for payment ${paymentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Best-effort: payment bi xoa -> giu dong tren Lark, doi status sang "da xoa".
   * Goi TRUOC khi xoa DB (luc do con larkRecordId). Bo qua neu payment chua sync.
   */
  async enqueuePaymentDelete(larkRecordId: string, larkSyncId: string): Promise<void> {
    try {
      await this.queue.add(
        LARK_JOB_MARK_DELETED,
        { larkRecordId, larkSyncId },
        { jobId: `pay-del-${larkRecordId}`, ...JOB_OPTS },
      );
      this.logger.log(`Enqueued lark mark-deleted for record ${larkRecordId}`);
    } catch (err) {
      this.logger.error(
        `Enqueue lark mark-deleted failed for record ${larkRecordId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
