import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(departmentId?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (departmentId) where.departmentId = BigInt(departmentId);

    const data = await this.prisma.team.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
        _count: { select: { members: { where: { deletedAt: null } } } },
      },
      orderBy: { id: 'asc' },
    });
    return { data };
  }

  async findById(id: bigint) {
    const team = await this.prisma.team.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
        members: {
          where: { deletedAt: null },
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    if (!team) throw new NotFoundException('Không tìm thấy team');
    return team;
  }

  async create(data: { name: string; departmentId: string; leaderId: string }) {
    const deptId = BigInt(data.departmentId);
    const leadId = BigInt(data.leaderId);

    // Trưởng nhóm phải là user role LEADER cùng phòng ban (quyền giám sát dựa trên role).
    await this.assertEligibleLeader(leadId, deptId);

    const team = await this.prisma.team.create({
      data: { name: data.name, departmentId: deptId, leaderId: leadId },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
      },
    });

    // Gán leader vào team mình lãnh đạo.
    await this.prisma.user.update({
      where: { id: leadId },
      data: { teamId: team.id },
    });

    return team;
  }

  /** Leader phải tồn tại, cùng phòng ban, và có role=LEADER. */
  private async assertEligibleLeader(leaderId: bigint, departmentId: bigint) {
    const leader = await this.prisma.user.findFirst({
      where: { id: leaderId, departmentId, deletedAt: null },
      select: { role: true },
    });
    if (!leader) {
      throw new BadRequestException('Trưởng nhóm phải thuộc cùng phòng ban');
    }
    if (leader.role !== UserRole.LEADER) {
      throw new BadRequestException('Chỉ chọn được user có vai trò Trưởng nhóm. Gán role Trưởng nhóm ở Quản lý NV trước.');
    }
  }

  async update(id: bigint, data: { name?: string; leaderId?: string }) {
    const team = await this.findById(id);

    if (data.leaderId) {
      const newLeadId = BigInt(data.leaderId);
      await this.assertEligibleLeader(newLeadId, team.department.id);

      // Gán leader mới vào team. (Không còn cờ isLeader - quyền dựa trên role=LEADER.)
      await this.prisma.user.update({
        where: { id: newLeadId },
        data: { teamId: id },
      });
    }

    return this.prisma.team.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.leaderId ? { leaderId: BigInt(data.leaderId) } : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async delete(id: bigint) {
    await this.findById(id);

    // Cascade detach: gỡ tất cả members (bao gồm leader) khỏi team rồi soft-delete
    // Transaction đảm bảo atomic: không để team bị xóa mà members vẫn giữ teamId cũ
    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { teamId: id },
        data: { teamId: null },
      }),
      this.prisma.team.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }
}
