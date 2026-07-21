import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '@crm/utils';
import { OmicallContactService, OmicallCreateContactInput } from './omicall-contact.service';
import { OMICALL_SYNC_QUEUE, OMICALL_JOB_SYNC_LEAD_OWNER } from './omicall.constants';

/**
 * Job payload pushed by OmicallSyncListener when a lead's assignedUserId
 * changes from non-null to a different non-null value. Strings (not BigInt)
 * because BullMQ serializes via JSON.
 */
export interface SyncLeadOwnerJobData {
  leadId: string;
  newAssignedUserId: string;
}

/**
 * BullMQ worker that reconciles a Lead's owner with the corresponding
 * OmiCall contact identified by phone number.
 *
 * Strategy:
 *   1. Load fresh lead + user from DB (event payload is post-commit snapshot).
 *   2. Search OmiCall by normalized phone.
 *   3. If contact exists -> update userOwnerEmail (latest-assign-wins).
 *      If not -> create with refId = `phone-{normalized}`.
 *
 * Failures throw; BullMQ retries via exponential backoff (see constants).
 */
@Processor(OMICALL_SYNC_QUEUE)
export class OmicallSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(OmicallSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly omicall: OmicallContactService,
  ) {
    super();
  }

  async process(job: Job<SyncLeadOwnerJobData>): Promise<void> {
    this.logger.log(`[trace] process job=${job.id} name=${job.name} data=${JSON.stringify(job.data)} enabled=${this.omicall.isEnabled()}`);
    if (job.name !== OMICALL_JOB_SYNC_LEAD_OWNER) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }
    if (!this.omicall.isEnabled()) {
      this.logger.warn('Skip job - OmiCall integration disabled (was enabled at startup?)');
      return;
    }

    const { leadId, newAssignedUserId } = job.data;

    const lead = await this.prisma.lead.findFirst({
      where: { id: BigInt(leadId), deletedAt: null },
      select: { id: true, name: true, phone: true, assignedUserId: true, source: { select: { name: true } } },
    });
    if (!lead || !lead.phone) {
      this.logger.warn(`Lead ${leadId} not found or no phone - skip`);
      return;
    }

    // Drift check: if the lead has since been re-assigned to yet another user,
    // skip this stale job. Latest-assign-wins handled by the newer job.
    if (lead.assignedUserId?.toString() !== newAssignedUserId) {
      this.logger.debug(`Lead ${leadId} drifted (now ${lead.assignedUserId}, job was ${newAssignedUserId}) - skip stale`);
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(newAssignedUserId), deletedAt: null },
      select: { id: true, email: true, name: true },
    });
    if (!user || !user.email) {
      this.logger.warn(`User ${newAssignedUserId} not found or no email - skip`);
      return;
    }

    const normalizedPhone = normalizePhone(lead.phone);
    const existing = await this.omicall.searchByPhone(normalizedPhone);

    if (existing) {
      await this.omicall.updateOwner(existing.refId, user.email);
      this.logger.log(`Updated OmiCall owner: lead=${leadId} phone=${normalizedPhone} -> ${user.email}`);
      return;
    }

    const payload = this.buildAddPayload(lead, user, normalizedPhone);
    await this.omicall.addContact(payload);
    this.logger.log(`Created OmiCall contact: lead=${leadId} phone=${normalizedPhone} owner=${user.email}`);
  }

  /**
   * Map CRM lead + new owner to OmiCall create-contact payload.
   *
   * note surfaces in OmiCall agent panel during incoming calls. Compose:
   *   - lead source (FB / Google / TikTok / etc.) for quick channel context
   *   - CRM lead #id for traceability back to this system
   */
  private buildAddPayload(
    lead: { id: bigint; name: string; source: { name: string } | null },
    user: { email: string; name: string },
    normalizedPhone: string,
  ): OmicallCreateContactInput {
    const sourceName = lead.source?.name ?? '-';
    return {
      refId: `phone-${normalizedPhone}`,
      fullName: lead.name,
      phone: normalizedPhone,
      userOwnerEmail: user.email,
      note: `Nguon: ${sourceName} | CRM lead #${lead.id.toString()}`,
    };
  }
}
