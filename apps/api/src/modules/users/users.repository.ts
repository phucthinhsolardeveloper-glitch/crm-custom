import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

// Fields to never return in API responses
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  departmentId: true,
  teamId: true,
  employeeLevelId: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  employeeLevel: { select: { id: true, name: true, rank: true } },
  // Có cấu hình SIP hay chưa: chỉ cần biết tồn tại (id) để hiển thị badge đã/chưa gắn.
  sipConfig: { select: { id: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(params: {
    where?: Prisma.UserWhereInput;
    cursor?: bigint;
    limit?: number;
    page?: number;
  }) {
    const { where = {}, cursor, limit = 20, page } = params;
    const baseWhere = { ...where, deletedAt: null };

    // ── Cursor-based (backward compat) ───────────────────────────────────────
    if (cursor) {
      const take = limit + 1;
      const users = await this.prisma.user.findMany({
        where: baseWhere, select: USER_SELECT,
        orderBy: { id: 'asc' }, take,
        skip: 1, cursor: { id: cursor },
      });
      const hasMore = users.length > limit;
      const data = hasMore ? users.slice(0, limit) : users;
      return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
    }

    // ── Offset-based with total count ────────────────────────────────────────
    const currentPage = page ?? 1;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: baseWhere, select: USER_SELECT,
        orderBy: { id: 'asc' },
        take: limit, skip: (currentPage - 1) * limit,
      }),
      this.prisma.user.count({ where: baseWhere }),
    ]);
    return {
      data: users,
      meta: { total, page: currentPage, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: bigint) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data, select: USER_SELECT });
  }

  async update(id: bigint, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  async softDelete(id: bigint) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
      select: USER_SELECT,
    });
  }
}
