import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EVENT_NAMES } from '../../common/event-bus/event-catalog';
import type { LeadAssignedUserChangedEvent } from '../../common/event-bus/event-catalog';
import {
  OMICALL_SYNC_QUEUE,
  OMICALL_JOB_SYNC_LEAD_OWNER,
  OMICALL_RETRY_ATTEMPTS,
  OMICALL_RETRY_BACKOFF_MS,
} from './omicall.constants';
import type { SyncLeadOwnerJobData } from './omicall-sync.processor';

/**
 * Subscribes to lead.assigned_user_changed and enqueues an OmiCall sync job.
 *
 * Skip rules:
 *   - after === null: lead unassigned (FLOATING/UNASSIGN/recall). Per design
 *     decision "giu nguyen owner cu", we do NOT touch OmiCall on unassign.
 *
 * Enqueue is fire-and-forget from the listener's POV; BullMQ owns retries.
 */
@Injectable()
export class OmicallSyncListener {
  private readonly logger = new Logger(OmicallSyncListener.name);

  constructor(
    @InjectQueue(OMICALL_SYNC_QUEUE) private readonly queue: Queue<SyncLeadOwnerJobData>,
  ) {}

  @OnEvent(EVENT_NAMES.LEAD_ASSIGNED_USER_CHANGED)
  async onLeadAssignedUserChanged(event: LeadAssignedUserChangedEvent): Promise<void> {
    if (event.after === null) {
      this.logger.debug(`Lead ${event.leadId} unassigned - keep OmiCall owner unchanged`);
      return;
    }

    const jobId = `lead-${event.leadId}-${event.after}`;
    await this.queue.add(
      OMICALL_JOB_SYNC_LEAD_OWNER,
      {
        leadId: event.leadId.toString(),
        newAssignedUserId: event.after.toString(),
      },
      {
        jobId,
        attempts: OMICALL_RETRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: OMICALL_RETRY_BACKOFF_MS },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400 },
      },
    );
  }
}
