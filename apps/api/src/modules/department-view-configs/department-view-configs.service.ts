import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Bố cục bảng leads cố định theo phòng ban.
 * Shape config JSONB: { visible: Record<string, boolean>, order: string[] }
 * - khớp shape localStorage v3 của use-column-prefs (trừ width).
 * Chỉ là display-config: khóa visibility + order cho USER/LEADER trên frontend.
 * KHÔNG phải access control - dữ liệu cột ẩn vẫn có trong API response.
 */
export interface DeptViewConfigShape {
  visible: Record<string, boolean>;
  order: string[];
}

const MAX_KEYS = 50;

@Injectable()
export class DepartmentViewConfigsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Config cho phòng ban của user hiện tại. null = không có config (tự do như cũ). */
  async getMine(departmentId: bigint | null | undefined) {
    if (!departmentId) return null;
    const row = await this.prisma.departmentViewConfig.findUnique({
      where: { departmentId },
    });
    return row ? (row.config as unknown as DeptViewConfigShape) : null;
  }

  /** Toàn bộ config - cho màn hình admin. */
  async listAll() {
    const rows = await this.prisma.departmentViewConfig.findMany({
      select: { departmentId: true, config: true, updatedAt: true },
    });
    return rows.map((r) => ({
      departmentId: String(r.departmentId),
      config: r.config as unknown as DeptViewConfigShape,
      updatedAt: r.updatedAt,
    }));
  }

  async upsert(departmentId: bigint, config: DeptViewConfigShape) {
    this.validateConfig(config);
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
    });
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban');

    const jsonConfig = config as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.departmentViewConfig.upsert({
      where: { departmentId },
      create: { departmentId, config: jsonConfig },
      update: { config: jsonConfig },
    });
    return { departmentId: String(row.departmentId), config };
  }

  async remove(departmentId: bigint) {
    await this.prisma.departmentViewConfig.deleteMany({ where: { departmentId } });
    return { message: 'Đã xóa cấu hình - phòng ban dùng bố cục tự do' };
  }

  /** Chặn junk: đúng shape, đúng kiểu, giới hạn số key (sanity bound). */
  private validateConfig(config: unknown): asserts config is DeptViewConfigShape {
    const c = config as Partial<DeptViewConfigShape> | null;
    if (!c || typeof c !== 'object') {
      throw new BadRequestException('config phải là object { visible, order }');
    }
    if (!c.visible || typeof c.visible !== 'object' || Array.isArray(c.visible)) {
      throw new BadRequestException('config.visible phải là object { [cột]: boolean }');
    }
    const visibleEntries = Object.entries(c.visible);
    if (visibleEntries.length > MAX_KEYS || visibleEntries.some(([, v]) => typeof v !== 'boolean')) {
      throw new BadRequestException('config.visible không hợp lệ');
    }
    if (
      !Array.isArray(c.order) ||
      c.order.length > MAX_KEYS ||
      c.order.some((k) => typeof k !== 'string' || k.length > 60)
    ) {
      throw new BadRequestException('config.order phải là mảng tên cột');
    }
  }
}
