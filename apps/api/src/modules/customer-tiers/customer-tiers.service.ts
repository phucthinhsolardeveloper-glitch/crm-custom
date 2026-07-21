import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_TTL } from '../../common/cache/cache.constants';

const CACHE_KEY_ALL = 'lookup:customer-tiers:all';
const CACHE_KEY_SORTED_DESC = 'lookup:customer-tiers:sorted-desc';

const ALLOWED_ICON_KEYS = new Set(['Award', 'Trophy', 'Medal', 'Gem', 'Crown', 'Star', 'Diamond']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z0-9-]+$/;

export interface CustomerTierInput {
  name?: string;
  slug?: string;
  minSpending?: number | string;
  color?: string;
  emoji?: string | null;
  iconKey?: string | null;
  sortOrder?: number;
  benefits?: string | null;
  isActive?: boolean;
}

function validateTierInput(data: CustomerTierInput, isCreate: boolean) {
  if (isCreate || data.name !== undefined) {
    if (!data.name || data.name.length === 0 || data.name.length > 50) {
      throw new BadRequestException('Tên tier bắt buộc, tối đa 50 ký tự');
    }
  }
  if (isCreate || data.slug !== undefined) {
    if (!data.slug || !SLUG_RE.test(data.slug) || data.slug.length < 2 || data.slug.length > 30) {
      throw new BadRequestException('Slug chỉ gồm a-z, 0-9, dấu -, dài 2-30 ký tự');
    }
  }
  if (isCreate || data.color !== undefined) {
    if (!data.color || !HEX_COLOR_RE.test(data.color)) {
      throw new BadRequestException('Color phải là hex format #RRGGBB');
    }
  }
  if (isCreate || data.minSpending !== undefined) {
    const v = Number(data.minSpending ?? 0);
    if (!Number.isFinite(v) || v < 0) {
      throw new BadRequestException('minSpending phải >= 0');
    }
  }
  if (data.emoji !== undefined && data.emoji !== null) {
    if (typeof data.emoji !== 'string' || data.emoji.length > 8) {
      throw new BadRequestException('Emoji tối đa 8 ký tự');
    }
  }
  if (data.iconKey !== undefined && data.iconKey !== null) {
    if (!ALLOWED_ICON_KEYS.has(data.iconKey)) {
      throw new BadRequestException(`iconKey không hợp lệ. Chọn 1 trong: ${[...ALLOWED_ICON_KEYS].join(', ')}`);
    }
  }
  if (data.benefits !== undefined && data.benefits !== null) {
    if (typeof data.benefits !== 'string' || data.benefits.length > 500) {
      throw new BadRequestException('Benefits tối đa 500 ký tự');
    }
  }
}

@Injectable()
export class CustomerTiersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheService,
  ) {}

  async list() {
    const data = await this.cache.getOrSet(
      CACHE_KEY_ALL,
      CACHE_TTL.LOOKUP,
      () => this.prisma.customerTier.findMany({ orderBy: { sortOrder: 'asc' } }),
    );
    return { data };
  }

  async findOne(id: bigint) {
    const tier = await this.prisma.customerTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('Không tìm thấy tier');
    return tier;
  }

  /**
   * Trả tiers active sort theo minSpending DESC.
   * Cached - gọi từ recalc hot path (mỗi payment verify).
   */
  async listSortedDesc() {
    return this.cache.getOrSet(
      CACHE_KEY_SORTED_DESC,
      CACHE_TTL.LOOKUP,
      () => this.prisma.customerTier.findMany({
        where: { isActive: true },
        orderBy: { minSpending: 'desc' },
      }),
    );
  }

  async create(input: CustomerTierInput) {
    validateTierInput(input, true);
    const created = await this.prisma.customerTier.create({
      data: {
        name: input.name!,
        slug: input.slug!,
        minSpending: new Prisma.Decimal(input.minSpending ?? 0),
        color: input.color!,
        emoji: input.emoji ?? null,
        iconKey: input.iconKey ?? null,
        sortOrder: input.sortOrder ?? 0,
        benefits: input.benefits ?? null,
        isActive: input.isActive ?? true,
      },
    });
    await this.invalidateCache();
    return created;
  }

  /**
   * Update tier. Trả về cả tier mới + flag `minSpendingChanged` để controller biết
   * có cần enqueue bulk recalc job hay không.
   */
  async update(id: bigint, input: CustomerTierInput) {
    validateTierInput(input, false);
    const existing = await this.findOne(id);

    const data: Prisma.CustomerTierUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.color !== undefined) data.color = input.color;
    if (input.emoji !== undefined) data.emoji = input.emoji;
    if (input.iconKey !== undefined) data.iconKey = input.iconKey;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.benefits !== undefined) data.benefits = input.benefits;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    let minSpendingChanged = false;
    if (input.minSpending !== undefined) {
      const newVal = new Prisma.Decimal(input.minSpending);
      if (!newVal.eq(existing.minSpending)) {
        data.minSpending = newVal;
        minSpendingChanged = true;
      }
    }

    const updated = await this.prisma.customerTier.update({ where: { id }, data });
    await this.invalidateCache();
    return { tier: updated, minSpendingChanged };
  }

  /**
   * Soft delete = set isActive=false. Customer giữ FK reference, badge vẫn render
   * nhưng tier không tham gia recalc (skip ở findTierByTotalSpent).
   */
  async deactivate(id: bigint) {
    await this.findOne(id); // 404 if not found
    const updated = await this.prisma.customerTier.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidateCache();
    return updated;
  }

  async reorder(updates: Array<{ id: bigint; sortOrder: number }>) {
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.customerTier.update({
          where: { id: u.id },
          data: { sortOrder: u.sortOrder },
        }),
      ),
    );
    await this.invalidateCache();
    return { updated: updates.length };
  }

  private async invalidateCache() {
    await Promise.all([
      this.cache.del(CACHE_KEY_ALL),
      this.cache.del(CACHE_KEY_SORTED_DESC),
    ]);
  }
}
