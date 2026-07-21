import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

const PRODUCT_SELECT = {
  id: true, name: true, price: true, description: true,
  categoryId: true, isCombo: true, vatRate: true, isActive: true,
  createdAt: true, updatedAt: true,
  category: { select: { id: true, name: true } },
  // SP con cua combo (rong neu khong phai combo) - cho card va form sua
  comboItems: { select: { child: { select: { id: true, name: true, price: true } } } },
} satisfies Prisma.ProductSelect;

/** Du lieu combo gui len khi tao/sua san pham. */
interface ComboInput {
  isCombo?: boolean;
  childProductIds?: string[];
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService,
    private readonly cacheService: CacheService,
  ) {}

  /** Danh sách rút gọn (id + name) MỌI sản phẩm đang bán - cho dropdown filter.
   *  Cache 10 phút (xoá khi create/update/softDelete). Khác list() có phân trang/search. */
  async lookup() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_PRODUCTS,
        CACHE_TTL.LOOKUP,
        () => this.prisma.product.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ),
    };
  }

  /**
   * Tem phiên bản catalog cho FE tự invalidate cache localStorage.
   * Đổi mỗi khi có create/update/softDelete (mọi thao tác đều bump updated_at qua @updatedAt).
   * count gộp cả bản xoá mềm -> chỉ tăng, không lùi. FE so tem này -> khác thì tải lại danh sách.
   */
  async cacheVersion() {
    const [agg, count] = await Promise.all([
      this.prisma.product.aggregate({ _max: { updatedAt: true } }),
      this.prisma.product.count(),
    ]);
    const ms = agg._max.updatedAt ? agg._max.updatedAt.getTime() : 0;
    return { version: `${ms}:${count}` };
  }

  async list(query: PaginationQueryDto & { search?: string; includeInactive?: string; categoryId?: string; type?: string }) {
    const limit = query.limit ?? 20;
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (query.includeInactive !== 'true') where.isActive = true;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    // Loc theo loai: 'combo' / 'normal' / 'inactive' (mac dinh la tat ca dang ban).
    if (query.type === 'combo') where.isCombo = true;
    else if (query.type === 'normal') where.isCombo = false;
    else if (query.type === 'inactive') where.isActive = false;
    // Lọc theo danh mục (legacy). 'none' = sản phẩm chưa phân loại (categoryId null).
    if (query.categoryId) {
      where.categoryId = query.categoryId === 'none' ? null : BigInt(query.categoryId);
    }

    // Cursor-based (load-more / backward compat khi caller truyền cursor)
    if (query.cursor) {
      const products = await this.prisma.product.findMany({
        where, select: PRODUCT_SELECT, orderBy: { id: 'desc' },
        take: limit + 1, skip: 1, cursor: { id: BigInt(query.cursor) },
      });
      const hasMore = products.length > limit;
      const data = hasMore ? products.slice(0, limit) : products;
      return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
    }

    // Offset-based + total count (phân trang đánh số)
    const page = query.page ?? 1;
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where, select: PRODUCT_SELECT, orderBy: { id: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data: products, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Đếm số sản phẩm theo từng danh mục (gồm cả inactive, loại đã xoá mềm).
   * Phục vụ sidebar lọc danh mục ở trang Sản phẩm.
   */
  async categoryCounts() {
    const grouped = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    let total = 0;
    let uncategorized = 0;
    const byCategory: Record<string, number> = {};
    for (const g of grouped) {
      const n = g._count._all;
      total += n;
      if (g.categoryId === null) uncategorized = n;
      else byCategory[g.categoryId.toString()] = n;
    }
    return { total, uncategorized, byCategory };
  }

  /**
   * Đếm sản phẩm theo loại cho sidebar trang Sản phẩm:
   * all (đang bán), combo, normal (đang bán), inactive (đã tắt).
   */
  async typeCounts() {
    const [all, combo, inactive] = await Promise.all([
      this.prisma.product.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.product.count({ where: { deletedAt: null, isActive: true, isCombo: true } }),
      this.prisma.product.count({ where: { deletedAt: null, isActive: false } }),
    ]);
    return { all, combo, normal: all - combo, inactive };
  }

  async findById(id: bigint) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null }, select: PRODUCT_SELECT,
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    return product;
  }

  /**
   * Kiểm tra dữ liệu combo: combo phải có >= 1 SP con, con phải tồn tại + không phải combo
   * (chặn lồng combo trong combo). Trả về danh sách id con đã chuẩn hoá.
   */
  private async validateComboInput(isCombo: boolean | undefined, childProductIds: string[] | undefined): Promise<bigint[]> {
    if (!isCombo) return [];
    const ids = [...new Set(childProductIds ?? [])].map((s) => BigInt(s));
    if (ids.length === 0) throw new BadRequestException('Combo phải có ít nhất 1 sản phẩm con');
    const children = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, isCombo: true },
    });
    if (children.length !== ids.length) throw new BadRequestException('Có sản phẩm con không tồn tại');
    if (children.some((c) => c.isCombo)) throw new BadRequestException('Không thể chọn 1 combo làm sản phẩm con');
    return ids;
  }

  async create(data: { name: string; price: number; description?: string; categoryId?: string; vatRate?: number } & ComboInput) {
    const childIds = await this.validateComboInput(data.isCombo, data.childProductIds);
    const product = await this.prisma.product.create({
      data: {
        name: data.name,
        price: data.price,
        description: data.description,
        vatRate: data.vatRate ?? 0,
        isCombo: data.isCombo ?? false,
        ...(data.categoryId ? { category: { connect: { id: BigInt(data.categoryId) } } } : {}),
        ...(childIds.length
          ? { comboItems: { create: childIds.map((productId) => ({ child: { connect: { id: productId } } })) } }
          : {}),
      },
      select: PRODUCT_SELECT,
    });
    // Báo toàn hệ thống: có sản phẩm mới. Lỗi gửi thông báo không chặn việc tạo SP.
    try {
      await this.notifications.createForAllUsers(
        `Sản phẩm mới: ${product.name}`,
        `Vừa thêm sản phẩm "${product.name}" vào hệ thống.`,
        'PRODUCT',
        product.id,
      );
    } catch { /* bỏ qua lỗi thông báo */ }
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PRODUCTS);
    return product;
  }

  async update(id: bigint, data: { name?: string; price?: number; description?: string; categoryId?: string; vatRate?: number; isActive?: boolean } & ComboInput) {
    const before = await this.findById(id);
    const updateData: Prisma.ProductUpdateInput = {};
    if (data.name) updateData.name = data.name;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.vatRate !== undefined) updateData.vatRate = data.vatRate;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isCombo !== undefined) updateData.isCombo = data.isCombo;
    if (data.categoryId !== undefined) {
      updateData.category = data.categoryId
        ? { connect: { id: BigInt(data.categoryId) } }
        : { disconnect: true };
    }

    // Đồng bộ SP con: gỡ combo -> xoá hết; gửi danh sách con mới -> thay toàn bộ.
    const targetIsCombo = data.isCombo ?? before.isCombo;
    if (data.isCombo === false) {
      await this.prisma.comboItem.deleteMany({ where: { comboId: id } });
    } else if (data.childProductIds !== undefined) {
      const childIds = await this.validateComboInput(targetIsCombo, data.childProductIds);
      await this.prisma.comboItem.deleteMany({ where: { comboId: id } });
      if (childIds.length) {
        await this.prisma.comboItem.createMany({ data: childIds.map((productId) => ({ comboId: id, productId })) });
      }
    }

    const updated = await this.prisma.product.update({ where: { id }, data: updateData, select: PRODUCT_SELECT });

    // Báo toàn hệ thống cho mọi cập nhật. Riêng đổi trạng thái bán có message riêng.
    const toggledActive = data.isActive !== undefined && data.isActive !== before.isActive;
    try {
      if (toggledActive) {
        const stopped = data.isActive === false;
        await this.notifications.createForAllUsers(
          stopped ? `Dừng bán: ${updated.name}` : `Mở bán lại: ${updated.name}`,
          stopped ? `Sản phẩm "${updated.name}" đã dừng bán.` : `Sản phẩm "${updated.name}" đã mở bán lại.`,
          'PRODUCT',
          updated.id,
        );
      } else {
        await this.notifications.createForAllUsers(
          `Cập nhật sản phẩm: ${updated.name}`,
          `Sản phẩm "${updated.name}" vừa được cập nhật.`,
          'PRODUCT',
          updated.id,
        );
      }
    } catch { /* bỏ qua lỗi thông báo */ }
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PRODUCTS);
    return updated;
  }

  async softDelete(id: bigint) {
    const before = await this.findById(id);
    const result = await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    // Báo toàn hệ thống: sản phẩm đã bị xoá.
    try {
      await this.notifications.createForAllUsers(
        `Xóa sản phẩm: ${before.name}`,
        `Sản phẩm "${before.name}" vừa bị xóa khỏi hệ thống.`,
        'PRODUCT',
        id,
      );
    } catch { /* bỏ qua lỗi thông báo */ }
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PRODUCTS);
    return result;
  }
}
