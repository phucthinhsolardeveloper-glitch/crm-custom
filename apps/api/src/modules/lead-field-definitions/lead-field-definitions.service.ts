import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

/**
 * Trường tùy chỉnh cho lead (SUPER_ADMIN định nghĩa, v1 chỉ kiểu text).
 * Giá trị lưu trong leads.metadata JSONB dưới def.key - service này vừa CRUD
 * định nghĩa vừa validate metadata đầu vào cho leads create/update.
 */
export interface LeadFieldDefinitionItem {
  id: bigint;
  key: string;
  label: string;
  type: string;
  isActive: boolean;
  sortOrder: number;
}

/** Slug an toàn cho JSONB key: chữ thường/số/gạch dưới, bắt đầu bằng chữ. */
const KEY_REGEX = /^[a-z][a-z0-9_]{0,39}$/;
/** Key hệ thống đã/sẽ dùng trong leads.metadata - cấm định nghĩa đè. */
const RESERVED_KEYS = new Set(['ailevel', 'aiscore']);
const MAX_VALUE_LENGTH = 500;

@Injectable()
export class LeadFieldDefinitionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async list(includeInactive = false) {
    const all = await this.cacheService.getOrSet(
      CACHE_KEYS.LOOKUP_LEAD_FIELD_DEFS,
      CACHE_TTL.LOOKUP,
      () =>
        this.prisma.leadFieldDefinition.findMany({
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        }),
    );
    return includeInactive ? all : all.filter((d: LeadFieldDefinitionItem) => d.isActive);
  }

  async create(data: { key: string; label: string; sortOrder?: number }) {
    const key = (data.key ?? '').trim().toLowerCase();
    if (!KEY_REGEX.test(key)) {
      throw new BadRequestException(
        'Mã trường chỉ gồm chữ thường/số/gạch dưới, bắt đầu bằng chữ, tối đa 40 ký tự',
      );
    }
    if (RESERVED_KEYS.has(key.replace(/_/g, ''))) {
      throw new BadRequestException('Mã trường trùng với trường hệ thống');
    }
    const label = (data.label ?? '').trim();
    if (!label || label.length > 100) {
      throw new BadRequestException('Tên hiển thị phải từ 1-100 ký tự');
    }
    try {
      const created = await this.prisma.leadFieldDefinition.create({
        data: { key, label, sortOrder: data.sortOrder ?? 0 },
      });
      await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_FIELD_DEFS);
      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Mã trường đã tồn tại');
      }
      throw e;
    }
  }

  /** key + type bất biến sau khi tạo - chỉ sửa label/isActive/sortOrder. */
  async update(id: bigint, data: { label?: string; isActive?: boolean; sortOrder?: number }) {
    const existing = await this.prisma.leadFieldDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy trường tùy chỉnh');
    if (data.label !== undefined && (!data.label.trim() || data.label.length > 100)) {
      throw new BadRequestException('Tên hiển thị phải từ 1-100 ký tự');
    }
    const updated = await this.prisma.leadFieldDefinition.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label.trim() }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_FIELD_DEFS);
    return updated;
  }

  /** Xóa = deactivate. Giá trị cũ trong leads.metadata giữ nguyên, chỉ không render. */
  async deactivate(id: bigint) {
    return this.update(id, { isActive: false });
  }

  /**
   * Validate metadata custom fields cho leads create/update.
   * - Chỉ chấp nhận key có định nghĩa active (key lạ -> 400).
   * - Giá trị: string (max 500 ký tự) hoặc null (= xóa key khi merge).
   * Trả về object đã trim, sẵn sàng merge vào leads.metadata.
   */
  async validateCustomMetadata(
    input: Record<string, unknown>,
  ): Promise<Record<string, string | null>> {
    const defs = (await this.list()) as LeadFieldDefinitionItem[];
    const activeKeys = new Set(defs.map((d) => d.key));
    const result: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!activeKeys.has(key)) {
        throw new BadRequestException(`Trường tùy chỉnh không hợp lệ: ${key}`);
      }
      if (value === null) {
        result[key] = null;
        continue;
      }
      // Ép primitive (boolean/number) -> string cho client gửi paid:true, count:5.
      // Object/array vẫn reject (String() ra "[object Object]" là rác, không lưu).
      const coerced =
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
          ? String(value)
          : null;
      if (coerced === null) {
        throw new BadRequestException(`Trường ${key} phải là chuỗi`);
      }
      if (coerced.length > MAX_VALUE_LENGTH) {
        throw new BadRequestException(`Trường ${key} tối đa ${MAX_VALUE_LENGTH} ký tự`);
      }
      result[key] = coerced.trim();
    }
    return result;
  }
}
