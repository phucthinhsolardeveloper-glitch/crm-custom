import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: PaginationQueryDto) {
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
      orderBy: { id: 'asc' },
      take,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = departments.length > limit;
    const data = hasMore ? departments.slice(0, limit) : departments;
    const nextCursor = hasMore ? data[data.length - 1].id : undefined;

    return { data, meta: { nextCursor: nextCursor?.toString() } };
  }

  async findById(id: bigint) {
    const dept = await this.prisma.department.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { users: { where: { deletedAt: null } } } },
        managers: { include: { manager: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!dept) throw new NotFoundException('Không tìm thấy phòng ban');
    return dept;
  }

  async create(data: { name: string }) {
    return this.prisma.department.create({ data });
  }

  async update(id: bigint, data: { name?: string }) {
    await this.findById(id);
    return this.prisma.department.update({ where: { id }, data });
  }

  async delete(id: bigint) {
    await this.findById(id);
    // Check no active users
    const activeUsers = await this.prisma.user.count({
      where: { departmentId: id, deletedAt: null },
    });
    if (activeUsers > 0) {
      throw new ConflictException('Không thể xóa phòng ban đang có nhân viên');
    }
    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
