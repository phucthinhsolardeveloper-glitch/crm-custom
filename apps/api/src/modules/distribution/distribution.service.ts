import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, Prisma } from '@prisma/client';
import { ScoringService } from './scoring.service';
import { EVENT_NAMES } from '../../common/event-bus/event-catalog';
import { SYSTEM_ACTOR } from '../../common/event-bus/system-actor';

@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scoring: ScoringService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Get distribution config for a department. */
  async getConfig(departmentId: bigint) {
    return this.prisma.aiDistributionConfig.findUnique({ where: { departmentId } });
  }

  /** Update distribution config. */
  async updateConfig(departmentId: bigint, data: { isActive?: boolean; weightConfig?: Record<string, number> }) {
    return this.prisma.aiDistributionConfig.upsert({
      where: { departmentId },
      update: { ...data, weightConfig: data.weightConfig as any },
      create: { departmentId, ...data, weightConfig: data.weightConfig as any },
    });
  }

  /** Auto-distribute a single lead from pool. */
  async distributeLead(leadId: bigint, departmentId: bigint, assignedBy: bigint) {
    const userId = await this.scoring.pickBestUser(departmentId);
    if (!userId) return null;

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { assignedUserId: userId, departmentId, status: 'ASSIGNED' },
    });

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'LEAD', entityId: leadId,
        toUserId: userId, toDepartmentId: departmentId,
        assignedBy, reason: 'Phân phối tự động (AI)',
      },
    });

    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leadId, userId: assignedBy,
        type: 'ASSIGNMENT',
        content: 'Phân phối tự động',
        metadata: { auto: true, toUserId: userId.toString() },
      },
    });

    return { leadId, assignedUserId: userId };
  }

  /**
   * Batch distribute leads from department pool - scores once, batch writes.
   * @param opts.includeZoom - mở rộng filter lên cả ZOOM leads (globally, không cần
   *   khớp departmentId của lead vì ZOOM lead thường có departmentId=null).
   */
  async batchDistribute(
    departmentId: bigint,
    assignedBy: bigint,
    opts: { includeZoom?: boolean } = {},
  ) {
    const where: Prisma.LeadWhereInput = opts.includeZoom
      ? {
          deletedAt: null,
          assignedUserId: null,
          OR: [
            { status: 'POOL', departmentId },
            { status: 'ZOOM' },
          ],
        }
      : { status: 'POOL', departmentId, assignedUserId: null, deletedAt: null };

    const leads = await this.prisma.lead.findMany({
      where,
      select: { id: true },
      take: 100,
    });

    if (leads.length === 0) return { distributed: 0, total: 0 };

    // Score users ONCE (instead of per-lead)
    const scores = await this.scoring.scoreUsers(departmentId);
    if (scores.length === 0) return { distributed: 0, total: leads.length };

    // Round-robin assignment across top users
    const assignments = leads.map((lead, i) => ({
      leadId: lead.id,
      userId: scores[i % scores.length].userId,
    }));

    // Batch all writes in a single transaction
    await this.prisma.$transaction(async (tx) => {
      // Group leads by assigned user for batch updateMany
      const byUser = new Map<string, bigint[]>();
      for (const a of assignments) {
        const key = a.userId.toString();
        if (!byUser.has(key)) byUser.set(key, []);
        byUser.get(key)!.push(a.leadId);
      }

      for (const [userId, leadIds] of byUser) {
        await tx.lead.updateMany({
          where: { id: { in: leadIds } },
          data: { assignedUserId: BigInt(userId), departmentId, status: 'ASSIGNED' },
        });
      }

      // updateMany doesn't trigger Prisma extension events. Emit semantic event
      // per lead so downstream listeners (OmiCall sync, workflows) fire.
      // before=null because batchDistribute only picks unassigned leads (filter line 75).
      for (const a of assignments) {
        this.eventEmitter.emit(EVENT_NAMES.LEAD_ASSIGNED_USER_CHANGED, {
          type: EVENT_NAMES.LEAD_ASSIGNED_USER_CHANGED,
          leadId: a.leadId,
          before: null,
          after: a.userId,
          actor: SYSTEM_ACTOR,
          at: new Date(),
        });
      }

      // Batch create assignment history
      await tx.assignmentHistory.createMany({
        data: assignments.map(a => ({
          entityType: 'LEAD' as const, entityId: a.leadId,
          toUserId: a.userId, toDepartmentId: departmentId,
          assignedBy, reason: 'Phân phối tự động (AI)',
        })),
      });

      // Batch create activities
      await tx.activity.createMany({
        data: assignments.map(a => ({
          entityType: 'LEAD' as const, entityId: a.leadId, userId: assignedBy,
          type: 'ASSIGNMENT' as const,
          content: 'Phân phối tự động',
          metadata: { auto: true, toUserId: a.userId.toString() },
        })),
      });
    });

    return { distributed: assignments.length, total: leads.length };
  }

  /** Get score preview for a department. */
  async getScores(departmentId: bigint) {
    return this.scoring.scoreUsers(departmentId);
  }
}
