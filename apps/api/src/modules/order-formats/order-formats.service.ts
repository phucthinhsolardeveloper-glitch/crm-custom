import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class OrderFormatsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_ORDER_FORMATS,
        CACHE_TTL.LOOKUP,
        () => this.prisma.orderFormat.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } }),
      ),
    };
  }

  async create(data: { name: string }) {
    const result = await this.prisma.orderFormat.create({ data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_ORDER_FORMATS);
    return result;
  }

  async update(id: bigint, data: { name?: string; isActive?: boolean }) {
    const record = await this.prisma.orderFormat.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy định dạng đơn hàng');
    const result = await this.prisma.orderFormat.update({ where: { id }, data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_ORDER_FORMATS);
    return result;
  }

  async deactivate(id: bigint) {
    const result = await this.prisma.orderFormat.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_ORDER_FORMATS);
    return result;
  }
}
