import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class ProductCategoriesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_PRODUCT_CATEGORIES,
        CACHE_TTL.LOOKUP,
        () => this.prisma.productCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      ),
    };
  }

  async create(data: { name: string; description?: string }) {
    const result = await this.prisma.productCategory.create({ data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PRODUCT_CATEGORIES);
    return result;
  }

  async update(id: bigint, data: { name?: string; description?: string; isActive?: boolean }) {
    const cat = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Không tìm thấy danh mục');
    const result = await this.prisma.productCategory.update({ where: { id }, data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PRODUCT_CATEGORIES);
    return result;
  }

  async deactivate(id: bigint) {
    const result = await this.prisma.productCategory.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PRODUCT_CATEGORIES);
    return result;
  }
}
