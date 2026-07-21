import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const MEMBER_SELECT = {
  userId: true,
  user: { select: { id: true, name: true } },
};

const TEMPLATE_SELECT = {
  id: true, name: true, strategy: true, isActive: true,
  createdBy: true, createdAt: true, updatedAt: true,
  creator: { select: { id: true, name: true } },
  members: { select: MEMBER_SELECT },
};

@Injectable()
export class AssignmentTemplatesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    return this.prisma.assignmentTemplate.findMany({
      select: TEMPLATE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: bigint) {
    const template = await this.prisma.assignmentTemplate.findUnique({
      where: { id },
      select: TEMPLATE_SELECT,
    });
    if (!template) throw new NotFoundException('Không tìm thấy mẫu phân phối');
    return template;
  }

  async create(
    data: { name: string; strategy?: string; memberUserIds: bigint[] },
    createdBy: bigint,
  ) {
    return this.prisma.$transaction(async (tx) => {
      return tx.assignmentTemplate.create({
        data: {
          name: data.name,
          strategy: data.strategy ?? 'ROUND_ROBIN',
          createdBy,
          members: {
            create: data.memberUserIds.map((userId) => ({ userId })),
          },
        },
        select: TEMPLATE_SELECT,
      });
    });
  }

  async update(
    id: bigint,
    data: { name?: string; strategy?: string; isActive?: boolean; memberUserIds?: bigint[] },
  ) {
    await this.getById(id);
    return this.prisma.$transaction(async (tx) => {
      if (data.memberUserIds !== undefined) {
        await tx.assignmentTemplateMember.deleteMany({ where: { templateId: id } });
        await tx.assignmentTemplateMember.createMany({
          data: data.memberUserIds.map((userId) => ({ templateId: id, userId })),
        });
      }
      return tx.assignmentTemplate.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.strategy !== undefined && { strategy: data.strategy }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        select: TEMPLATE_SELECT,
      });
    });
  }

  async remove(id: bigint) {
    await this.getById(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.assignmentTemplateMember.deleteMany({ where: { templateId: id } });
      await tx.assignmentTemplate.delete({ where: { id } });
    });
    return { message: 'Đã xóa mẫu phân phối' };
  }

  async applyTemplate(templateId: bigint, leadIds: bigint[], assignedBy: bigint, labelId?: bigint) {
    const template = await this.getById(templateId);
    const members = template.members;

    if (members.length === 0) {
      return { assigned: 0, skipped: leadIds.length, reassigned: 0, newAssigned: 0 };
    }

    // Validate nhãn (nếu có) trước khi vào transaction
    if (labelId) {
      const label = await this.prisma.label.findFirst({ where: { id: labelId, isActive: true } });
      if (!label) throw new BadRequestException('Nhãn không tồn tại');
    }

    // Relax filter: cho phép mọi status TRỪ CONVERTED/LOST (auto-recall in same tx)
    const leads = await this.prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        status: { notIn: ['CONVERTED', 'LOST'] },
        deletedAt: null,
      },
      select: { id: true, status: true, assignedUserId: true, departmentId: true },
    });

    const skipped = leadIds.length - leads.length;

    if (leads.length === 0) {
      return { assigned: 0, skipped, reassigned: 0, newAssigned: 0 };
    }

    // Round-robin: group leads by target user, then batch updateMany + createMany
    // Phân biệt new-assign vs reassign để log message + status khác nhau
    const userLeadGroupsNew = new Map<string, bigint[]>();      // assignedUserId == null -> ASSIGNED
    const userLeadGroupsReassign = new Map<string, bigint[]>(); // assignedUserId != null -> IN_PROGRESS
    const historyData: {
      entityType: 'LEAD'; entityId: bigint;
      fromUserId: bigint | null; toUserId: bigint;
      fromDepartmentId: bigint | null;
      assignedBy: bigint; reason: string;
    }[] = [];

    let reassignedCount = 0;
    let newAssignedCount = 0;
    const eligibleLeads: typeof leads = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const member = members[i % members.length];
      const userId = member.userId;

      // Skip nếu lead đang giữ bởi chính target user (idempotent)
      if (lead.assignedUserId === userId) continue;

      eligibleLeads.push(lead);
      const key = userId.toString();
      const isReassign = lead.assignedUserId != null;

      const groupMap = isReassign ? userLeadGroupsReassign : userLeadGroupsNew;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(lead.id);

      if (isReassign) reassignedCount++;
      else newAssignedCount++;

      historyData.push({
        entityType: 'LEAD', entityId: lead.id,
        fromUserId: lead.assignedUserId,
        toUserId: userId,
        fromDepartmentId: lead.departmentId,
        assignedBy,
        reason: isReassign
          ? `Phân lại theo mẫu: ${template.name}`
          : `Áp dụng mẫu phân phối: ${template.name}`,
      });
    }

    if (eligibleLeads.length === 0) {
      // Áp nhãn ngay cả khi tất cả lead đã giữ bởi cùng user (no assignment change)
      if (labelId && leads.length > 0) {
        await this.prisma.lead.updateMany({
          where: { id: { in: leads.map(l => l.id) } },
          data: { labelId, labelAssignedAt: new Date() },
        });
      }
      return {
        assigned: 0,
        skipped: leadIds.length,
        reassigned: 0,
        newAssigned: 0,
        sameOwnerSkipped: leads.length,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [userIdStr, leadIdGroup] of userLeadGroupsNew) {
        await tx.lead.updateMany({
          where: { id: { in: leadIdGroup } },
          data: { assignedUserId: BigInt(userIdStr), status: 'ASSIGNED' },
        });
      }
      for (const [userIdStr, leadIdGroup] of userLeadGroupsReassign) {
        await tx.lead.updateMany({
          where: { id: { in: leadIdGroup } },
          data: { assignedUserId: BigInt(userIdStr), status: 'IN_PROGRESS' },
        });
      }
      await tx.assignmentHistory.createMany({ data: historyData });

      if (labelId) {
        // Gắn nhãn cho TẤT CẢ lead được chọn trong đợt phân (gồm cả same-owner skipped)
        await tx.lead.updateMany({
          where: { id: { in: leads.map(l => l.id) } },
          data: { labelId, labelAssignedAt: new Date() },
        });
      } else {
        // Không chọn nhãn: chỉ reset label-recall timer cho lead đã có nhãn
        const allIds = eligibleLeads.map(l => l.id);
        await tx.lead.updateMany({
          where: { id: { in: allIds }, labelId: { not: null } },
          data: { labelAssignedAt: new Date() },
        });
      }
    });

    return {
      assigned: eligibleLeads.length,
      skipped: leadIds.length - eligibleLeads.length,
      reassigned: reassignedCount,
      newAssigned: newAssignedCount,
      sameOwnerSkipped: leads.length - eligibleLeads.length,
    };
  }
}
