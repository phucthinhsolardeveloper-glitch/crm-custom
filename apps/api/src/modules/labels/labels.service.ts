import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { assertLabelConfigAction } from '../recall-config/recall-config.service';

interface LabelInput {
  name?: string;
  color?: string;
  textColor?: string;
  category?: string;
  isActive?: boolean;
  triggersOrder?: boolean;
  /**
   * Auto-recall window for this label, expressed in MINUTES.
   * - `undefined` → don't touch existing config
   * - `null` → delete existing config (turn off automation, "Nothing" mode)
   * - `number > 0` → upsert config
   * Only SUPER_ADMIN may set this field. UI converts user-friendly units
   * (min/hour/day) into minutes before posting.
   */
  recallMinutes?: number | null;
  /**
   * What happens when the window expires: RECALL (pull lead back to POOL) or
   * NOTIFY (only notify the assigned user). Defaults to RECALL when a config
   * is created without it. Ignored when recallMinutes is undefined/null.
   */
  action?: string;
}

interface ActingUser {
  id: bigint;
  role: UserRole;
}

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list(category?: string) {
    const allLabels = await this.cacheService.getOrSet(
      CACHE_KEYS.LOOKUP_LABELS,
      CACHE_TTL.LOOKUP,
      () => this.prisma.label.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    );
    const data = category ? allLabels.filter((l: any) => l.category === category) : allLabels;
    return { data };
  }

  async create(data: LabelInput & { name: string }, user: ActingUser) {
    this._assertCanSetRecall(data, user);
    if (data.recallMinutes !== undefined && data.recallMinutes !== null && data.recallMinutes <= 0) {
      throw new ForbiddenException('Số phút recall phải > 0');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const label = await tx.label.create({
        data: {
          name: data.name,
          color: data.color,
          textColor: data.textColor,
          category: data.category,
          triggersOrder: data.triggersOrder ?? false,
        },
      });
      if (data.recallMinutes != null) {
        await tx.labelRecallConfig.create({
          data: {
            labelId: label.id,
            recallMinutes: data.recallMinutes,
            action: data.action ?? 'RECALL',
            createdBy: user.id,
          },
        });
      }
      return label;
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  async update(id: bigint, data: LabelInput, user: ActingUser) {
    this._assertCanSetRecall(data, user);
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Không tìm thấy nhãn');

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.label.update({
        where: { id },
        data: {
          name: data.name,
          color: data.color,
          textColor: data.textColor,
          category: data.category,
          isActive: data.isActive,
          ...(data.triggersOrder !== undefined && { triggersOrder: data.triggersOrder }),
        },
      });

      if (data.recallMinutes !== undefined) {
        await this._syncRecallConfig(tx, id, data.recallMinutes, data.action, user.id);
      }
      return updated;
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  async deactivate(id: bigint) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Không tìm thấy nhãn');
    const result = await this.prisma.label.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LABELS);
    return result;
  }

  /** Reject if non-SUPER_ADMIN tries to set recallMinutes/action - surface clearly, not silently ignore. */
  private _assertCanSetRecall(data: LabelInput, user: ActingUser) {
    if (
      (data.recallMinutes !== undefined || data.action !== undefined) &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Chỉ super admin được cấu hình auto-recall theo nhãn');
    }
    if (data.action !== undefined) assertLabelConfigAction(data.action);
  }

  /** Upsert/delete LabelRecallConfig within an existing transaction client. */
  private async _syncRecallConfig(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    labelId: bigint,
    newMinutes: number | null,
    requestedAction: string | undefined,
    actingUserId: bigint,
  ) {
    const existing = await tx.labelRecallConfig.findUnique({ where: { labelId } });
    if (newMinutes === null) {
      if (existing) await tx.labelRecallConfig.delete({ where: { id: existing.id } });
      return;
    }
    if (newMinutes <= 0) throw new ForbiddenException('Số phút recall phải > 0');
    // Omitted action keeps the existing mode - a PATCH that only changes the
    // window must not silently flip NOTIFY back to RECALL.
    const action = requestedAction ?? existing?.action ?? 'RECALL';
    if (existing) {
      if (existing.recallMinutes !== newMinutes || existing.action !== action || !existing.isActive) {
        await tx.labelRecallConfig.update({
          where: { id: existing.id },
          data: { recallMinutes: newMinutes, action, isActive: true },
        });
      }
    } else {
      await tx.labelRecallConfig.create({
        data: { labelId, recallMinutes: newMinutes, action, createdBy: actingUserId },
      });
    }
  }

  // ── Nhãn hiển thị theo phòng ban ──────────────────────────────────────────
  // Chỉ ảnh hưởng danh sách chip quick-filter (labelCounts), KHÔNG ảnh hưởng
  // picker gán nhãn. Phòng ban không có config = thấy tất cả nhãn.

  /** Trả về toàn bộ config: mỗi phòng ban kèm danh sách labelIds đã cấu hình. */
  async getDepartmentLabelConfig() {
    const rows = await this.prisma.departmentLabel.findMany({
      select: { departmentId: true, labelId: true },
    });
    const byDept = new Map<string, string[]>();
    for (const row of rows) {
      const deptId = String(row.departmentId);
      const list = byDept.get(deptId) ?? [];
      list.push(String(row.labelId));
      byDept.set(deptId, list);
    }
    return {
      data: Array.from(byDept.entries()).map(([departmentId, labelIds]) => ({
        departmentId,
        labelIds,
      })),
    };
  }

  /** Thay toàn bộ config của 1 phòng ban. labelIds rỗng = xóa config (fallback thấy tất cả). */
  async setDepartmentLabelConfig(departmentId: bigint, labelIds: string[]) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
    });
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban');

    let ids: bigint[];
    try {
      ids = labelIds.map((id) => BigInt(id));
    } catch {
      throw new BadRequestException('labelIds không hợp lệ');
    }

    if (ids.length > 0) {
      const found = await this.prisma.label.count({ where: { id: { in: ids } } });
      if (found !== new Set(ids.map(String)).size) {
        throw new BadRequestException('Có nhãn không tồn tại trong danh sách');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.departmentLabel.deleteMany({ where: { departmentId } });
      if (ids.length > 0) {
        await tx.departmentLabel.createMany({
          data: ids.map((labelId) => ({ departmentId, labelId })),
          skipDuplicates: true,
        });
      }
    });
    return { departmentId: String(departmentId), labelIds: ids.map(String) };
  }

  // Lead has a single label (FK on leads.label_id). Pass null to clear.
  // Also resets labelAssignedAt - used by per-label recall cron.
  // Logs Activity LABEL_CHANGE for audit + employee report (Lượt tương tác metric).
  async setLeadLabel(leadId: bigint, labelId: bigint | null, actingUserId: bigint) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.lead.findUnique({
        where: { id: leadId },
        select: { labelId: true },
      });
      if (!current) throw new NotFoundException('Lead không tồn tại');
      const fromLabelId = current.labelId;

      // Skip no-op (cùng nhãn) - không tạo Activity rác
      if (fromLabelId === labelId) return;

      await tx.lead.update({
        where: { id: leadId },
        data: { labelId, labelAssignedAt: labelId ? new Date() : null },
      });

      await tx.activity.create({
        data: {
          entityType: 'LEAD',
          entityId: leadId,
          userId: actingUserId,
          type: 'LABEL_CHANGE',
          metadata: {
            fromLabelId: fromLabelId ? fromLabelId.toString() : null,
            toLabelId: labelId ? labelId.toString() : null,
          },
        },
      });
    });
  }

  // Customer keeps multi-label (junction table customer_labels)
  async attachToCustomer(customerId: bigint, labelIds: bigint[]) {
    const data = labelIds.map((labelId) => ({ customerId, labelId }));
    await this.prisma.customerLabel.createMany({ data, skipDuplicates: true });
  }

  async detachFromCustomer(customerId: bigint, labelId: bigint) {
    await this.prisma.customerLabel.deleteMany({ where: { customerId, labelId } });
  }
}
