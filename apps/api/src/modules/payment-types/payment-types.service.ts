import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class PaymentTypesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_PAYMENT_TYPES,
        CACHE_TTL.LOOKUP,
        () => this.prisma.paymentType.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } }),
      ),
    };
  }

  async create(data: { name: string; description?: string }) {
    const result = await this.prisma.paymentType.create({ data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PAYMENT_TYPES);
    return result;
  }

  async update(id: bigint, data: { name?: string; description?: string; isActive?: boolean }) {
    const pt = await this.prisma.paymentType.findUnique({ where: { id } });
    if (!pt) throw new NotFoundException('Không tìm thấy loại thanh toán');
    const result = await this.prisma.paymentType.update({ where: { id }, data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PAYMENT_TYPES);
    return result;
  }

  async deactivate(id: bigint) {
    const result = await this.prisma.paymentType.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_PAYMENT_TYPES);
    return result;
  }
}
