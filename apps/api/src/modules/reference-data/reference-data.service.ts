import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Delegate Prisma tối thiểu cần để tính tem: aggregate(_max updatedAt) + count. Mọi bảng lookup đều có. */
type VersionableDelegate = {
  aggregate: (args: { _max: { updatedAt: true } }) => Promise<{ _max: { updatedAt: Date | null } }>;
  count: () => Promise<number>;
};

/**
 * Tem phiên bản cho data tham chiếu dùng chung (lookup) - FE so tem để tự làm mới cache localStorage
 * ngay khi có ai CRUD, không phải chờ TTL. Mỗi tem = `MAX(updated_at):COUNT` của bảng;
 * mọi create/update/softDelete đều bump updated_at qua @updatedAt nên tem luôn đổi.
 */
@Injectable()
export class ReferenceDataService {
  constructor(private readonly prisma: PrismaClient) {}

  async versions() {
    const [products, leadSources, leadGroups, users, departments, labels, leadFieldDefinitions] = await Promise.all([
      this.tableVersion(this.prisma.product),
      this.tableVersion(this.prisma.leadSource),
      this.tableVersion(this.prisma.leadGroup),
      this.tableVersion(this.prisma.user),
      this.tableVersion(this.prisma.department),
      this.tableVersion(this.prisma.label),
      this.tableVersion(this.prisma.leadFieldDefinition),
    ]);
    return { products, leadSources, leadGroups, users, departments, labels, leadFieldDefinitions };
  }

  private async tableVersion(delegate: unknown): Promise<string> {
    const d = delegate as VersionableDelegate;
    const [agg, count] = await Promise.all([
      d.aggregate({ _max: { updatedAt: true } }),
      d.count(),
    ]);
    const ms = agg._max.updatedAt ? new Date(agg._max.updatedAt).getTime() : 0;
    return `${ms}:${count}`;
  }
}
