import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

const USER_PHONE_SELECT = {
  id: true,
  phone: true,
  userId: true,
  assignedAt: true,
  assignedBy: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, department: { select: { name: true } } } },
  assigner: { select: { id: true, name: true } },
} satisfies Prisma.UserPhoneSelect;

const HISTORY_SELECT = {
  id: true,
  phone: true,
  userId: true,
  assignedAt: true,
  releasedAt: true,
  reason: true,
  changedBy: true,
  note: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
  changer: { select: { id: true, name: true } },
} satisfies Prisma.UserPhoneHistorySelect;

@Injectable()
export class UserPhonesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveByPhone(phone: string) {
    return this.prisma.userPhone.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true, userId: true },
    });
  }

  async findById(id: bigint) {
    return this.prisma.userPhone.findFirst({
      where: { id, deletedAt: null },
      select: USER_PHONE_SELECT,
    });
  }

  async list(filter: { userId?: bigint; phone?: string; cursor?: bigint; limit: number }) {
    const where: Prisma.UserPhoneWhereInput = { deletedAt: null };
    if (filter.userId) where.userId = filter.userId;
    if (filter.phone) where.phone = { contains: filter.phone };

    const rows = await this.prisma.userPhone.findMany({
      where,
      select: USER_PHONE_SELECT,
      orderBy: { id: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { skip: 1, cursor: { id: filter.cursor } } : {}),
    });

    const hasMore = rows.length > filter.limit;
    const data = hasMore ? rows.slice(0, filter.limit) : rows;
    return {
      data,
      meta: { nextCursor: hasMore ? data[data.length - 1].id.toString() : undefined },
    };
  }

  async listByUser(userId: bigint) {
    return this.prisma.userPhone.findMany({
      where: { userId, deletedAt: null },
      select: USER_PHONE_SELECT,
      orderBy: { assignedAt: 'desc' },
    });
  }

  async listHistory(userPhoneId: bigint) {
    const current = await this.prisma.userPhone.findFirst({
      where: { id: userPhoneId },
      select: { phone: true },
    });
    if (!current) return [];
    return this.prisma.userPhoneHistory.findMany({
      where: { phone: current.phone },
      select: HISTORY_SELECT,
      orderBy: { releasedAt: 'desc' },
    });
  }

  async listHistoryByPhone(phone: string) {
    return this.prisma.userPhoneHistory.findMany({
      where: { phone },
      select: HISTORY_SELECT,
      orderBy: { releasedAt: 'desc' },
    });
  }

  async create(data: { phone: string; userId: bigint; assignedBy: bigint; note?: string | null }) {
    return this.prisma.userPhone.create({
      data: {
        phone: data.phone,
        userId: data.userId,
        assignedBy: data.assignedBy,
        note: data.note ?? null,
      },
      select: USER_PHONE_SELECT,
    });
  }

  async transferTx(
    id: bigint,
    newUserId: bigint,
    changedBy: bigint,
    note?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userPhone.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, phone: true, userId: true, assignedAt: true },
      });
      if (!existing) return null;

      const now = new Date();
      await tx.userPhoneHistory.create({
        data: {
          phone: existing.phone,
          userId: existing.userId,
          assignedAt: existing.assignedAt,
          releasedAt: now,
          reason: 'TRANSFERRED',
          changedBy,
          note: note ?? null,
        },
      });

      return tx.userPhone.update({
        where: { id },
        data: { userId: newUserId, assignedBy: changedBy, assignedAt: now, note: note ?? null },
        select: USER_PHONE_SELECT,
      });
    });
  }

  async softDeleteTx(id: bigint, changedBy: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userPhone.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, phone: true, userId: true, assignedAt: true },
      });
      if (!existing) return null;

      const now = new Date();
      await tx.userPhoneHistory.create({
        data: {
          phone: existing.phone,
          userId: existing.userId,
          assignedAt: existing.assignedAt,
          releasedAt: now,
          reason: 'DELETED',
          changedBy,
        },
      });

      return tx.userPhone.update({
        where: { id },
        data: { deletedAt: now },
        select: { id: true },
      });
    });
  }

  async userExists(userId: bigint) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    return Boolean(u);
  }
}
