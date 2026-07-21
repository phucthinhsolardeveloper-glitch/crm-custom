import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma, TaskStatus, UserRole, EntityType } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildAccessFilter, AccessFilterUser } from '../../common/filters/build-access-filter';
import { CreateTaskDto, TaskReminderDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CronRunService } from '../cron-run/cron-run.service';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatVnDateTime(date: Date): string {
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Saigon' });
}

/** Internal reminder shape used in create/update logic (remindAt as Date). */
interface ReminderInput {
  remindAt: Date;
  label?: string | null;
}

// ─── select shape ────────────────────────────────────────────────────────────

const TASK_SELECT = {
  id: true, title: true, description: true,
  entityType: true, entityId: true,
  assignedTo: true, createdBy: true,
  dueDate: true,
  status: true, priority: true, completedAt: true,
  createdAt: true, updatedAt: true,
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  reminders: true,
} satisfies Prisma.TaskSelect;

// ─── service ─────────────────────────────────────────────────────────────────

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cronRunService: CronRunService,
  ) {}

  // ── helpers ──

  /** Returns up to 3 default reminder times (1 day / 1 hour / 30 min before due), filtered to future only. */
  private computeDefaultReminders(dueDate: Date, now = new Date()): ReminderInput[] {
    const candidates = [
      { offset: 24 * 60 * 60 * 1000, label: '1 ngày trước' },
      { offset: 60 * 60 * 1000,      label: '1 giờ trước' },
      { offset: 30 * 60 * 1000,      label: '30 phút trước' },
    ];
    return candidates
      .map(c => ({ remindAt: new Date(dueDate.getTime() - c.offset), label: c.label }))
      .filter(r => r.remindAt > now);
  }

  /** Validate that every remindAt is strictly before dueDate. */
  private validateReminderTimes(reminders: TaskReminderDto[], dueDate: Date): void {
    for (const r of reminders) {
      if (new Date(r.remindAt) >= dueDate) {
        throw new BadRequestException('Mốc nhắc phải trước hạn công việc');
      }
    }
  }

  // ── access check ──

  /** Verify task exists and user has ownership (assignee, creator, or MANAGER+). */
  private async findTaskWithOwnershipCheck(
    id: bigint,
    userId: bigint,
    userRole: UserRole,
    departmentId?: bigint | null,
  ) {
    const user: AccessFilterUser = { id: userId, role: userRole, departmentId: departmentId ?? null };
    const accessFilter = buildAccessFilter(user, 'task');
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null, ...accessFilter },
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc hoặc bạn không có quyền');
    return task;
  }

  // ── CRUD ──

  async list(userId: bigint, query: PaginationQueryDto & { status?: TaskStatus }) {
    const limit = query.limit ?? 20;
    const where: Prisma.TaskWhereInput = { assignedTo: userId, deletedAt: null };
    if (query.status) where.status = query.status;

    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [{ dueDate: 'asc' }, { priority: 'desc' }];

    // Cursor-based (load-more / backward compat)
    if (query.cursor) {
      const tasks = await this.prisma.task.findMany({
        where, select: TASK_SELECT, orderBy,
        take: limit + 1, skip: 1, cursor: { id: BigInt(query.cursor) },
      });
      const hasMore = tasks.length > limit;
      const data = hasMore ? tasks.slice(0, limit) : tasks;
      return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
    }

    // Offset-based + total count (phân trang đánh số)
    const page = query.page ?? 1;
    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where, select: TASK_SELECT, orderBy,
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return { data: tasks, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(dto: CreateTaskDto, createdBy: bigint) {
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    // Reminders: use DTO if provided, else auto-compute from dueDate
    const dtoReminders: TaskReminderDto[] = dto.reminders ?? [];
    let reminders: ReminderInput[];
    if (dtoReminders.length === 0 && dueDate) {
      reminders = this.computeDefaultReminders(dueDate);
    } else {
      reminders = dtoReminders.map(r => ({ remindAt: new Date(r.remindAt), label: r.label }));
    }

    // Validate remindAt < dueDate
    if (dueDate && reminders.length > 0) {
      for (const r of reminders) {
        if (r.remindAt >= dueDate) {
          throw new BadRequestException('Mốc nhắc phải trước hạn công việc');
        }
      }
    }

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        assignedTo: BigInt(dto.assignedTo),
        createdBy,
        dueDate,
        priority: (dto.priority as any) ?? 'MEDIUM',
        entityType: dto.entityType as any,
        entityId: dto.entityId ? BigInt(dto.entityId) : null,
        status: 'PENDING',
        reminders: reminders.length ? {
          create: reminders.map(r => ({
            remindAt: r.remindAt,
            label: r.label ?? null,
          })),
        } : undefined,
      },
      select: TASK_SELECT,
    });
  }

  async update(id: bigint, dto: UpdateTaskDto, userId: bigint, userRole: UserRole) {
    const existing = await this.findTaskWithOwnershipCheck(id, userId, userRole);

    const newDueDate = dto.dueDate !== undefined
      ? (dto.dueDate ? new Date(dto.dueDate) : null)
      : existing.dueDate;

    // Validate reminders against effective dueDate
    if (dto.reminders !== undefined && dto.reminders.length > 0 && newDueDate) {
      this.validateReminderTimes(dto.reminders, newDueDate);
    }

    return this.prisma.$transaction(async (tx) => {
      // Replace reminders if caller sent the field (even empty array = delete all)
      if (dto.reminders !== undefined) {
        await tx.taskReminder.deleteMany({ where: { taskId: id } });
        if (dto.reminders.length > 0) {
          await tx.taskReminder.createMany({
            data: dto.reminders.map(r => ({
              taskId: id,
              remindAt: new Date(r.remindAt),
              label: r.label ?? null,
            })),
          });
        }
      }

      const updateData: Prisma.TaskUpdateInput = {};
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.dueDate !== undefined) updateData.dueDate = newDueDate;
      if (dto.priority !== undefined) updateData.priority = dto.priority as any;
      if (dto.assignedTo !== undefined) {
        updateData.assignee = { connect: { id: BigInt(dto.assignedTo) } };
      }

      return tx.task.update({
        where: { id },
        data: updateData,
        select: TASK_SELECT,
      });
    });
  }

  async complete(id: bigint, userId: bigint, userRole: UserRole) {
    const task = await this.findTaskWithOwnershipCheck(id, userId, userRole);
    if (task.status === 'COMPLETED') throw new ConflictException('Công việc đã hoàn thành');
    if (task.status === 'CANCELLED') throw new ConflictException('Không thể hoàn thành công việc đã hủy');
    return this.prisma.task.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      select: TASK_SELECT,
    });
  }

  async cancel(id: bigint, userId: bigint, userRole: UserRole) {
    await this.findTaskWithOwnershipCheck(id, userId, userRole);
    return this.prisma.task.update({
      where: { id },
      data: { status: 'CANCELLED' },
      select: TASK_SELECT,
    });
  }

  async remove(id: bigint, userId: bigint, userRole: UserRole) {
    await this.findTaskWithOwnershipCheck(id, userId, userRole);
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ── Cron ──

  /** Every 1 minute: process due reminders + escalation L1/L2. */
  @Cron('*/1 * * * *')
  async processReminders() {
    try {
      await this.cronRunService.track('task-reminder', async (ctx) => {
        const result = await this._processRemindersImpl();
        ctx.affected = result.totalAffected;
        ctx.metadata = result.breakdown;
      });
    } catch (error) {
      this.logger.error('Lỗi khi xử lý reminders/escalations', error instanceof Error ? error.stack : error);
    }
  }

  private async _processRemindersImpl(): Promise<{ totalAffected: number; breakdown: Record<string, number> }> {
    const now = new Date();
    const breakdown = { reminders: 0, escalation1: 0, escalation2: 0 };

    // ── Main reminders (task_reminders table) ──
      const dueReminders = await this.prisma.taskReminder.findMany({
        where: {
          remindAt: { lte: now },
          remindedAt: null,
          task: { status: 'PENDING', deletedAt: null },
        },
        include: { task: true },
        take: 500,
      });

      if (dueReminders.length > 0) {
        const notifications = dueReminders.map(r => ({
          userId: r.task.assignedTo,
          title: `${r.label ?? 'Nhắc nhở'}: ${r.task.title}`,
          content: r.task.dueDate
            ? `Hạn: ${formatVnDateTime(r.task.dueDate)}`
            : 'Công việc đến hạn nhắc',
          type: 'TASK_REMIND',
          // EntityType enum only supports LEAD/CUSTOMER - leave null for pure tasks
          entityType: r.task.entityType ?? null,
          entityId: r.task.entityType ? r.task.entityId : null,
        }));

        await this.prisma.$transaction([
          this.prisma.notification.createMany({ data: notifications }),
          this.prisma.taskReminder.updateMany({
            where: { id: { in: dueReminders.map(r => r.id) } },
            data: { remindedAt: now },
          }),
        ]);

        breakdown.reminders = dueReminders.length;
        this.logger.log(`Đã gửi ${dueReminders.length} nhắc nhở`);
      }

      // ── Escalation L1: overdue > 1 hour, escalation1At IS NULL, PENDING ──
      const overdue1h = new Date(now.getTime() - 60 * 60 * 1000);
      const escalation1Tasks = await this.prisma.task.findMany({
        where: {
          dueDate: { lte: overdue1h },
          escalation1At: null,
          status: 'PENDING',
          deletedAt: null,
        },
        select: { id: true, title: true, assignedTo: true, entityType: true, entityId: true },
        take: 100,
      });

      if (escalation1Tasks.length > 0) {
        await this.prisma.notification.createMany({
          data: escalation1Tasks.map(task => ({
            userId: task.assignedTo,
            title: 'Công việc quá hạn',
            content: `"${task.title}" đã quá hạn hơn 1 giờ`,
            type: 'TASK_OVERDUE',
            // Propagate entity link so user can click thông báo → nhảy về lead/customer
            entityType: task.entityType ?? null,
            entityId: task.entityType ? task.entityId : null,
          })),
        });
        await this.prisma.task.updateMany({
          where: { id: { in: escalation1Tasks.map(t => t.id) } },
          data: { escalation1At: now },
        });
        breakdown.escalation1 = escalation1Tasks.length;
      }

      // ── Escalation L2: overdue > 24 hours, escalation2At IS NULL, PENDING → notify manager ──
      const overdue24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const escalation2Tasks = await this.prisma.task.findMany({
        where: {
          dueDate: { lte: overdue24h },
          escalation2At: null,
          status: 'PENDING',
          deletedAt: null,
        },
        select: {
          id: true, title: true, assignedTo: true,
          entityType: true, entityId: true,
          assignee: { select: { departmentId: true, name: true } },
        },
        take: 100,
      });

      if (escalation2Tasks.length > 0) {
        const deptIds = [...new Set(
          escalation2Tasks
            .map(t => t.assignee?.departmentId)
            .filter((d): d is bigint => d !== null && d !== undefined),
        )];

        const allManagers = deptIds.length > 0
          ? await this.prisma.user.findMany({
              where: {
                departmentId: { in: deptIds },
                role: { in: ['MANAGER', 'SUPER_ADMIN'] },
                status: 'ACTIVE',
              },
              select: { id: true, departmentId: true },
            })
          : [];

        const managersByDept = new Map<string, bigint[]>();
        for (const m of allManagers) {
          const key = m.departmentId!.toString();
          if (!managersByDept.has(key)) managersByDept.set(key, []);
          managersByDept.get(key)!.push(m.id);
        }

        const notifications: {
          userId: bigint;
          title: string;
          content: string;
          type: string;
          entityType: EntityType | null;
          entityId: bigint | null;
        }[] = [];
        const taskIdsToUpdate: bigint[] = [];

        for (const task of escalation2Tasks) {
          if (task.assignee?.departmentId) {
            const managers = managersByDept.get(task.assignee.departmentId.toString()) ?? [];
            for (const managerId of managers) {
              notifications.push({
                userId: managerId,
                title: 'Công việc nhân viên quá hạn',
                content: `"${task.title}" của ${task.assignee.name} đã quá hạn hơn 24 giờ`,
                type: 'TASK_ESCALATION',
                // Manager click thông báo → nhảy về lead/customer của nhân viên
                entityType: task.entityType ?? null,
                entityId: task.entityType ? task.entityId : null,
              });
            }
          }
          taskIdsToUpdate.push(task.id);
        }

        if (notifications.length > 0) {
          await this.prisma.notification.createMany({ data: notifications });
        }
        if (taskIdsToUpdate.length > 0) {
          await this.prisma.task.updateMany({
            where: { id: { in: taskIdsToUpdate } },
            data: { escalation2At: now },
          });
        }
        breakdown.escalation2 = escalation2Tasks.length;
      }

    const totalAffected = breakdown.reminders + breakdown.escalation1 + breakdown.escalation2;
    return { totalAffected, breakdown };
  }
}
