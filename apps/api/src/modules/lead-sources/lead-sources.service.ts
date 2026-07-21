import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class LeadSourcesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_LEAD_SOURCES,
        CACHE_TTL.LOOKUP,
        () => this.prisma.leadSource.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      ),
    };
  }

  async create(data: { name: string; description?: string; skipPool?: boolean }) {
    const result = await this.prisma.leadSource.create({ data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_SOURCES);
    return result;
  }

  async update(id: bigint, data: { name?: string; description?: string; isActive?: boolean; skipPool?: boolean }) {
    const source = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Không tìm thấy nguồn lead');
    const result = await this.prisma.leadSource.update({ where: { id }, data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_SOURCES);
    return result;
  }

  async deactivate(id: bigint) {
    const source = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Không tìm thấy nguồn lead');
    const result = await this.prisma.leadSource.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_SOURCES);
    return result;
  }
}
