import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class EmployeeLevelsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_EMPLOYEE_LEVELS,
        CACHE_TTL.LOOKUP,
        () => this.prisma.employeeLevel.findMany({ where: { deletedAt: null }, orderBy: { rank: 'asc' } }),
      ),
    };
  }

  async findById(id: bigint) {
    const level = await this.prisma.employeeLevel.findFirst({
      where: { id, deletedAt: null },
    });
    if (!level) throw new NotFoundException('Không tìm thấy cấp bậc');
    return level;
  }

  async create(data: { name: string; rank: number }) {
    const result = await this.prisma.employeeLevel.create({ data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_EMPLOYEE_LEVELS);
    return result;
  }

  async update(id: bigint, data: { name?: string; rank?: number }) {
    await this.findById(id);
    const result = await this.prisma.employeeLevel.update({ where: { id }, data });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_EMPLOYEE_LEVELS);
    return result;
  }

  async delete(id: bigint) {
    await this.findById(id);
    const result = await this.prisma.employeeLevel.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_EMPLOYEE_LEVELS);
    return result;
  }
}
