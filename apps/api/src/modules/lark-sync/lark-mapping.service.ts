import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CRM_FIELD_CATALOG } from './lark-field-catalog';
import { UpsertLarkMappingDto } from './dto/upsert-lark-mapping.dto';
import { LARK_MAPPING_CACHE_PREFIX, LARK_MAPPING_CACHE_TTL } from './lark-sync.constants';

/** Shape mapping da resolve cho worker (fieldMap ep kieu tu JSONB). */
export interface ResolvedLarkMapping {
  id: bigint;
  name: string;
  baseToken: string | null;
  tableId: string;
  fieldMap: Record<string, string>;
  enabled: boolean;
}

/**
 * CRUD duong ong LarkSyncMapping (doc lap voi san pham) + cache doc theo id cho
 * worker. Don hang tro truc tiep duong ong qua order.larkSyncId. Admin sua -> invalidate cache.
 */
@Injectable()
export class LarkMappingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheService,
  ) {}

  async list() {
    const mappings = await this.prisma.larkSyncMapping.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return { data: mappings };
  }

  /** Danh sach rut gon (id + name) duong ong dang bat - cho dropdown tao don (moi role). */
  async listOptions() {
    const data = await this.prisma.larkSyncMapping.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { data };
  }

  /**
   * Doc duong ong enabled theo id (cached) - dung trong worker.
   * Tra null khi duong ong khong ton tai hoac bi tat.
   */
  async getEnabledById(id: bigint): Promise<ResolvedLarkMapping | null> {
    const cacheKey = `${LARK_MAPPING_CACHE_PREFIX}${id}`;
    const result = await this.cache.getOrSet<ResolvedLarkMapping | 'NONE'>(
      cacheKey,
      LARK_MAPPING_CACHE_TTL,
      async () => {
        const mapping = await this.prisma.larkSyncMapping.findUnique({
          where: { id },
        });
        if (!mapping || !mapping.enabled) return 'NONE';
        return {
          id: mapping.id,
          name: mapping.name,
          baseToken: mapping.baseToken,
          tableId: mapping.tableId,
          fieldMap: mapping.fieldMap as Record<string, string>,
          enabled: mapping.enabled,
        };
      },
    );
    return result === 'NONE' ? null : result;
  }

  /** Tao moi (khong co id) hoac cap nhat duong ong theo id. */
  async upsert(dto: UpsertLarkMappingDto) {
    this.validateDto(dto);
    const data = {
      name: dto.name.trim(),
      baseToken: dto.baseToken?.trim() || null,
      tableId: dto.tableId.trim(),
      fieldMap: dto.fieldMap as Prisma.InputJsonValue,
      enabled: dto.enabled ?? true,
    };

    let mapping;
    if (dto.id) {
      const id = BigInt(dto.id);
      const existing = await this.prisma.larkSyncMapping.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException('Đường ống Lark không tồn tại');
      mapping = await this.prisma.larkSyncMapping.update({ where: { id }, data });
      await this.cache.del(`${LARK_MAPPING_CACHE_PREFIX}${id}`);
    } else {
      mapping = await this.prisma.larkSyncMapping.create({ data });
    }
    return { data: mapping };
  }

  async remove(id: bigint) {
    const mapping = await this.prisma.larkSyncMapping.findUnique({ where: { id }, select: { id: true } });
    if (!mapping) throw new NotFoundException('Đường ống Lark không tồn tại');

    await this.prisma.larkSyncMapping.delete({ where: { id } });
    await this.cache.del(`${LARK_MAPPING_CACHE_PREFIX}${id}`);
    return { data: { success: true } };
  }

  /** Chan name/tableId rong va catalogKey khong hop le truoc khi luu. */
  private validateDto(dto: UpsertLarkMappingDto): void {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Tên đường ống không được để trống');
    }
    if (dto.id !== undefined && !/^\d+$/.test(dto.id)) {
      throw new BadRequestException('id không hợp lệ');
    }
    if (!dto.tableId?.trim()) {
      throw new BadRequestException('tableId không được để trống');
    }
    if (!dto.fieldMap || typeof dto.fieldMap !== 'object' || Array.isArray(dto.fieldMap)) {
      throw new BadRequestException('fieldMap phải là object { "Cột Lark": "catalogKey" }');
    }
    const entries = Object.entries(dto.fieldMap);
    if (entries.length === 0) {
      throw new BadRequestException('fieldMap phải có ít nhất 1 cột');
    }
    for (const [larkCol, catalogKey] of entries) {
      if (!larkCol.trim()) {
        throw new BadRequestException('Tên cột Lark không được để trống');
      }
      if (!CRM_FIELD_CATALOG[catalogKey]) {
        throw new BadRequestException(
          `CRM field không hợp lệ: "${catalogKey}" (cột "${larkCol}")`,
        );
      }
    }
  }
}
