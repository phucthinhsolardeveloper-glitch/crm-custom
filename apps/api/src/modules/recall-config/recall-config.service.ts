import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma, LeadStatus, CustomerStatus, UserStatus, UserRole } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { CronRunService } from '../cron-run/cron-run.service';

const SYSTEM_USER_EMAIL = 'system@internal';
const ACTIVITY_BATCH_SIZE = 100;

// Per-label automation modes. "Nothing" = no config row, so only these two
// values are ever persisted in label_recall_configs.action.
export const LABEL_CONFIG_ACTIONS = ['RECALL', 'NOTIFY'] as const;
export type LabelConfigAction = (typeof LABEL_CONFIG_ACTIONS)[number];

export function assertLabelConfigAction(action: string): asserts action is LabelConfigAction {
  if (!LABEL_CONFIG_ACTIONS.includes(action as LabelConfigAction)) {
    throw new BadRequestException(`Chế độ không hợp lệ: ${action}. Chỉ chấp nhận RECALL hoặc NOTIFY`);
  }
}

interface RecalledEntity {
  id: bigint;
  assignedUserId: bigint | null;
  departmentId?: bigint | null;
  assignedDepartmentId?: bigint | null;
}

@Injectable()
export class RecallConfigService {
  private readonly logger = new Logger(RecallConfigService.name);
  /** Cached after first lookup to avoid hitting DB every cron tick. */
  private systemUserId: bigint | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cronRunService: CronRunService,
  ) {}

  async list() {
    const configs = await this.prisma.recallConfig.findMany({
      orderBy: [{ entityType: 'asc' }, { createdAt: 'asc' }],
      include: { creator: { select: { id: true, name: true } } },
    });
    return { data: configs };
  }

  async getById(id: bigint) {
    const config = await this.prisma.recallConfig.findUnique({
      where: { id },
      include: { creator: { select: { id: true, name: true } } },
    });
    if (!config) throw new NotFoundException('Cấu hình auto-recall không tồn tại');
    return { data: config };
  }

  async create(
    data: { entityType: string; maxDaysInPool: number; autoLabelId: bigint | null },
    createdBy: bigint,
  ) {
    const config = await this.prisma.recallConfig.create({
      data: {
        entityType: data.entityType,
        maxDaysInPool: data.maxDaysInPool,
        autoLabelId: data.autoLabelId,
        createdBy,
      },
      include: { creator: { select: { id: true, name: true } } },
    });
    return { data: config };
  }

  async update(
    id: bigint,
    data: { maxDaysInPool?: number; autoLabelId?: bigint | null; isActive?: boolean },
  ) {
    await this.getById(id);
    const config = await this.prisma.recallConfig.update({
      where: { id },
      data,
      include: { creator: { select: { id: true, name: true } } },
    });
    return { data: config };
  }

  async remove(id: bigint) {
    await this.getById(id);
    await this.prisma.recallConfig.delete({ where: { id } });
    return { data: { success: true } };
  }

  // ── Label Recall Config CRUD ─────────────────────────────────────────────

  async listLabelConfigs() {
    const configs = await this.prisma.labelRecallConfig.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        label: { select: { id: true, name: true, color: true, textColor: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    return { data: configs };
  }

  async getLabelConfigById(id: bigint) {
    const config = await this.prisma.labelRecallConfig.findUnique({
      where: { id },
      include: {
        label: { select: { id: true, name: true, color: true, textColor: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    if (!config) throw new NotFoundException('Cấu hình recall theo nhãn không tồn tại');
    return { data: config };
  }

  async createLabelConfig(
    data: { labelId: bigint; recallMinutes: number; action?: string },
    createdBy: bigint,
  ) {
    const action = data.action ?? 'RECALL';
    assertLabelConfigAction(action);
    const existing = await this.prisma.labelRecallConfig.findUnique({
      where: { labelId: data.labelId },
    });
    if (existing) throw new ConflictException('Nhãn này đã có cấu hình recall');

    const config = await this.prisma.labelRecallConfig.create({
      data: { labelId: data.labelId, recallMinutes: data.recallMinutes, action, createdBy },
      include: {
        label: { select: { id: true, name: true, color: true, textColor: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    return { data: config };
  }

  async updateLabelConfig(
    id: bigint,
    data: { recallMinutes?: number; isActive?: boolean; action?: string },
  ) {
    if (data.action !== undefined) assertLabelConfigAction(data.action);
    await this.getLabelConfigById(id);
    const config = await this.prisma.labelRecallConfig.update({
      where: { id },
      data,
      include: {
        label: { select: { id: true, name: true, color: true, textColor: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    return { data: config };
  }

  async removeLabelConfig(id: bigint) {
    await this.getLabelConfigById(id);
    await this.prisma.labelRecallConfig.delete({ where: { id } });
    return { data: { success: true } };
  }

  // Runs every 5 minutes - label-based recall now supports minute-level
  // granularity (min 5 min). The pool/customer recall (day-based) is also
  // re-evaluated each tick; that's cheap because the cutoff only shifts
  // meaningfully on a daily timescale.
  @Cron('*/5 * * * *')
  async runAutoRecall() {
    try {
      await this.cronRunService.track('auto-recall', async (ctx) => {
        this.logger.log('Bắt đầu chạy auto-recall...');
        const configs = await this.prisma.recallConfig.findMany({ where: { isActive: true } });

        const breakdown: Record<string, number> = { LEAD: 0, CUSTOMER: 0, BY_LABEL: 0, NOTIFY: 0 };
        let totalRecalled = 0;

        for (const config of configs) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - config.maxDaysInPool);

          if (config.entityType === 'LEAD') {
            const n = await this._recallLeads(config, cutoffDate);
            breakdown.LEAD += n;
            totalRecalled += n;
          } else if (config.entityType === 'CUSTOMER') {
            const n = await this._recallCustomers(config, cutoffDate);
            breakdown.CUSTOMER += n;
            totalRecalled += n;
          }
        }

        const labelRecalled = await this._recallLeadsByLabel();
        breakdown.BY_LABEL += labelRecalled;
        totalRecalled += labelRecalled;

        const labelNotified = await this._notifyLeadsByLabel();
        breakdown.NOTIFY += labelNotified;
        totalRecalled += labelNotified;

        ctx.affected = totalRecalled;
        ctx.metadata = { breakdown };

        this.logger.log(`Auto-recall hoàn thành. Tổng số entities đã thu hồi: ${totalRecalled}`);
        return { recalled: totalRecalled };
      });
      return { recalled: 0 };
    } catch (error) {
      // Already recorded as FAILED in cron_runs; keep stdout log for ops parity.
      this.logger.error('Lỗi khi chạy auto-recall', error instanceof Error ? error.stack : error);
      return { recalled: 0, error: true };
    }
  }

  private async _recallLeads(
    config: { id: bigint; maxDaysInPool: number; autoLabelId: bigint | null },
    cutoffDate: Date,
  ): Promise<number> {
    const CHUNK_SIZE = 500;
    let totalRecalled = 0;

    while (true) {
      const leads = await this.prisma.lead.findMany({
        where: {
          status: LeadStatus.POOL,
          departmentId: { not: null },
          assignedUserId: null,
          deletedAt: null,
          updatedAt: { lt: cutoffDate },
        },
        // Capture previous state BEFORE updateMany - needed for activity log.
        // labelId included to skip auto-label assignment for already-labeled leads.
        select: { id: true, assignedUserId: true, departmentId: true, labelId: true },
        take: CHUNK_SIZE,
      });

      if (leads.length === 0) break;

      const leadIds = leads.map((l) => l.id);

      await this.prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: { status: LeadStatus.FLOATING, departmentId: null, assignedUserId: null },
      });

      // Skip-if-exists: only auto-label leads that have no label set
      if (config.autoLabelId) {
        const idsWithoutLabel = leads.filter((l) => l.labelId === null).map((l) => l.id);
        if (idsWithoutLabel.length > 0) {
          await this.prisma.lead.updateMany({
            where: { id: { in: idsWithoutLabel } },
            data: { labelId: config.autoLabelId, labelAssignedAt: new Date() },
          });
        }
      }

      await this._logRecallActivities('LEAD', leads, 'Tự động thu hồi về kho thả nổi (quá hạn ngày)', {
        trigger: 'AUTO_RECALL_POOL',
        configId: config.id.toString(),
        maxDaysInPool: config.maxDaysInPool,
      });

      totalRecalled += leads.length;
      if (leads.length < CHUNK_SIZE) break;
    }

    if (totalRecalled > 0) this.logger.log(`Đã thu hồi ${totalRecalled} leads về kho thả nổi`);
    return totalRecalled;
  }

  private async _recallCustomers(
    config: { id: bigint; maxDaysInPool: number; autoLabelId: bigint | null },
    cutoffDate: Date,
  ): Promise<number> {
    const CHUNK_SIZE = 500;
    let totalRecalled = 0;

    while (true) {
      const customers = await this.prisma.customer.findMany({
        where: {
          status: CustomerStatus.ACTIVE,
          assignedDepartmentId: { not: null },
          assignedUserId: null,
          deletedAt: null,
          updatedAt: { lt: cutoffDate },
        },
        select: { id: true, assignedUserId: true, assignedDepartmentId: true },
        take: CHUNK_SIZE,
      });

      if (customers.length === 0) break;

      const customerIds = customers.map((c) => c.id);

      await this.prisma.customer.updateMany({
        where: { id: { in: customerIds } },
        data: { status: CustomerStatus.FLOATING, assignedDepartmentId: null, assignedUserId: null },
      });

      // Customer keeps multi-label junction; attach single autoLabelId via createMany (idempotent)
      if (config.autoLabelId) {
        const labelData = customerIds.map((customerId) => ({
          customerId,
          labelId: config.autoLabelId!,
        }));
        await this.prisma.customerLabel.createMany({ data: labelData, skipDuplicates: true });
      }

      await this._logRecallActivities('CUSTOMER', customers, 'Tự động thu hồi về kho thả nổi (quá hạn ngày)', {
        trigger: 'AUTO_RECALL_POOL',
        configId: config.id.toString(),
        maxDaysInPool: config.maxDaysInPool,
      });

      totalRecalled += customers.length;
      if (customers.length < CHUNK_SIZE) break;
    }

    if (totalRecalled > 0) this.logger.log(`Đã thu hồi ${totalRecalled} customers về kho thả nổi`);
    return totalRecalled;
  }

  private async _recallLeadsByLabel(): Promise<number> {
    const configs = await this.prisma.labelRecallConfig.findMany({
      where: { isActive: true, action: 'RECALL', label: { isActive: true } },
      include: { label: { select: { name: true } } },
    });
    if (configs.length === 0) return 0;

    const CHUNK_SIZE = 500;
    let totalRecalled = 0;

    for (const config of configs) {
      const cutoffDate = new Date(Date.now() - config.recallMinutes * 60_000);

      let configRecalled = 0;
      while (true) {
        const leads = await this.prisma.lead.findMany({
          where: {
            assignedUserId: { not: null },
            deletedAt: null,
            status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] },
            labelId: config.labelId,
            labelAssignedAt: { lt: cutoffDate },
          },
          select: { id: true, assignedUserId: true, departmentId: true },
          take: CHUNK_SIZE,
        });

        if (leads.length === 0) break;

        const leadIds = leads.map((l) => l.id);

        await this.prisma.lead.updateMany({
          where: { id: { in: leadIds } },
          data: { status: LeadStatus.POOL, departmentId: null, assignedUserId: null },
        });

        await this._logRecallActivities(
          'LEAD',
          leads,
          `Tự động thu hồi theo nhãn "${config.label.name}" (sau ${config.recallMinutes} phút)`,
          {
            trigger: 'AUTO_RECALL_LABEL',
            labelId: config.labelId.toString(),
            labelName: config.label.name,
            recallMinutes: config.recallMinutes,
          },
        );

        configRecalled += leads.length;
        if (leads.length < CHUNK_SIZE) break;
      }

      if (configRecalled > 0) {
        this.logger.log(
          `Đã thu hồi ${configRecalled} leads theo nhãn (labelId=${config.labelId}, ${config.recallMinutes} phút)`,
        );
      }
      totalRecalled += configRecalled;
    }

    return totalRecalled;
  }

  /**
   * NOTIFY mode: ping the user holding the lead instead of pulling it back.
   * Idempotent per label-assignment cycle via the two-timestamp comparison
   * (labelNotifiedAt vs labelAssignedAt) - re-assigning the label re-arms the
   * reminder without any reset logic at the 12 labelAssignedAt write sites.
   */
  private async _notifyLeadsByLabel(): Promise<number> {
    const configs = await this.prisma.labelRecallConfig.findMany({
      where: { isActive: true, action: 'NOTIFY', label: { isActive: true } },
      include: { label: { select: { name: true } } },
    });
    if (configs.length === 0) return 0;

    const CHUNK_SIZE = 500;
    let totalNotified = 0;

    for (const config of configs) {
      const cutoffDate = new Date(Date.now() - config.recallMinutes * 60_000);
      const overdueText = this._humanizeMinutes(config.recallMinutes);

      let configNotified = 0;
      while (true) {
        const leads = await this.prisma.lead.findMany({
          where: {
            assignedUserId: { not: null },
            deletedAt: null,
            status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] },
            labelId: config.labelId,
            labelAssignedAt: { lt: cutoffDate },
            OR: [
              { labelNotifiedAt: null },
              { labelNotifiedAt: { lt: this.prisma.lead.fields.labelAssignedAt } },
            ],
          },
          select: { id: true, name: true, assignedUserId: true },
          take: CHUNK_SIZE,
        });

        if (leads.length === 0) break;

        // Notify first, mark after: if we crash in between, the next tick
        // re-sends once. A rare duplicate beats a silently lost reminder.
        await this.prisma.notification.createMany({
          data: leads.map((lead) => ({
            userId: lead.assignedUserId!,
            title: `Nhãn "${config.label.name}" quá hạn`,
            content: `Lead "${lead.name}" gắn nhãn "${config.label.name}" đã quá ${overdueText} - cần xử lý`,
            type: 'LABEL_OVERDUE',
            entityType: 'LEAD' as const,
            entityId: lead.id,
          })),
        });

        await this.prisma.lead.updateMany({
          where: { id: { in: leads.map((l) => l.id) } },
          data: { labelNotifiedAt: new Date() },
        });

        configNotified += leads.length;
        if (leads.length < CHUNK_SIZE) break;
      }

      if (configNotified > 0) {
        this.logger.log(
          `Đã thông báo ${configNotified} leads quá hạn nhãn (labelId=${config.labelId}, ${config.recallMinutes} phút)`,
        );
      }
      totalNotified += configNotified;
    }

    return totalNotified;
  }

  /** 1440-divisible → ngày, 60-divisible → giờ, else phút (mirrors UI decomposeMinutes). */
  private _humanizeMinutes(minutes: number): string {
    if (minutes % 1440 === 0) return `${minutes / 1440} ngày`;
    if (minutes % 60 === 0) return `${minutes / 60} giờ`;
    return `${minutes} phút`;
  }

  /**
   * Batch-create per-entity activity rows so users see "system recalled this lead"
   * in the timeline. Captures the user/department the entity was assigned to before
   * recall - useful for forensic / undo flows.
   *
   * Failure here must not break the recall itself (already mutated rows). All
   * exceptions are caught + logged.
   */
  private async _logRecallActivities(
    entityType: 'LEAD' | 'CUSTOMER',
    items: RecalledEntity[],
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (items.length === 0) return;

    const userId = await this._getSystemUserId();
    if (!userId) {
      this.logger.warn('System user missing - skipping activity log for recall batch');
      return;
    }

    try {
      // Chunk to avoid one bad row killing the whole batch.
      for (let i = 0; i < items.length; i += ACTIVITY_BATCH_SIZE) {
        const chunk = items.slice(i, i + ACTIVITY_BATCH_SIZE);
        const prevDeptKey = entityType === 'LEAD' ? 'departmentId' : 'assignedDepartmentId';
        const data = chunk.map((item) => ({
          entityType,
          entityId: item.id,
          userId,
          type: 'SYSTEM' as const,
          content: reason,
          metadata: {
            ...metadata,
            previousAssignedUserId: item.assignedUserId?.toString() ?? null,
            previousDepartmentId: (item[prevDeptKey] as bigint | null | undefined)?.toString() ?? null,
          } as Prisma.InputJsonValue,
        }));
        try {
          await this.prisma.activity.createMany({ data });
        } catch (err) {
          this.logger.error(
            `Activity log chunk failed (${chunk.length} rows): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Activity logging failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Lookup the system user, creating it on first miss. Cached for the lifetime
   * of the process so cron runs don't re-query each tick.
   *
   * The user is INACTIVE and gets a random unguessable password - it cannot be
   * used to log in. Its only purpose is to satisfy the NOT NULL FK on Activity.
   */
  private async _getSystemUserId(): Promise<bigint | null> {
    if (this.systemUserId !== null) return this.systemUserId;
    try {
      const existing = await this.prisma.user.findFirst({
        where: { email: SYSTEM_USER_EMAIL, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        this.systemUserId = existing.id;
        return this.systemUserId;
      }
      // First boot: create. Random hash → no possible login.
      const randomPassword = await bcrypt.hash(`system-${Date.now()}-${Math.random()}`, 12);
      const created = await this.prisma.user.create({
        data: {
          email: SYSTEM_USER_EMAIL,
          name: 'System',
          passwordHash: randomPassword,
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.INACTIVE,
        },
        select: { id: true },
      });
      this.systemUserId = created.id;
      this.logger.log(`Created system user ${SYSTEM_USER_EMAIL} (id=${created.id})`);
      return this.systemUserId;
    } catch (err) {
      this.logger.error(`Could not resolve system user: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
