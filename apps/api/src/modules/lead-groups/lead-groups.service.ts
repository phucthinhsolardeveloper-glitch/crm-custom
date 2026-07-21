import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class LeadGroupsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  /** List nhóm active, kèm Nguồn cha. Lọc theo sourceId nếu truyền. */
  async list(sourceId?: string) {
    const all = await this.cacheService.getOrSet(
      CACHE_KEYS.LOOKUP_LEAD_GROUPS,
      CACHE_TTL.LOOKUP,
      () =>
        this.prisma.leadGroup.findMany({
          where: { isActive: true },
          include: { source: { select: { id: true, name: true, skipPool: true } } },
          orderBy: [{ sourceId: 'asc' }, { name: 'asc' }],
        }),
    );
    const data = sourceId ? all.filter((g) => g.sourceId.toString() === sourceId) : all;
    return { data };
  }

  async create(data: {
    name: string;
    sourceId: string;
    description?: string;
    skipPool?: boolean | null;
  }) {
    const sourceId = await this.assertSourceExists(data.sourceId);
    const name = data.name.trim();
    await this.assertNameUnique(name, sourceId);
    const result = await this.prisma.leadGroup.create({
      // skipPool tri-state: undefined -> null (kế thừa Nguồn cha) là mặc định cột.
      data: { name, sourceId, description: data.description, skipPool: data.skipPool ?? null },
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_GROUPS);
    return result;
  }

  async update(
    id: bigint,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      sourceId?: string;
      skipPool?: boolean | null;
    },
  ) {
    const group = await this.prisma.leadGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Không tìm thấy nhóm nguồn');

    const sourceId = data.sourceId ? await this.assertSourceExists(data.sourceId) : undefined;
    const name = data.name !== undefined ? data.name.trim() : undefined;
    // Đổi tên hoặc đổi nguồn -> kiểm tra trùng (chuẩn hóa trim + không phân biệt hoa/thường),
    // bỏ qua chính nhóm đang sửa.
    if (name !== undefined || sourceId !== undefined) {
      await this.assertNameUnique(name ?? group.name, sourceId ?? group.sourceId, id);
    }
    const result = await this.prisma.leadGroup.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(sourceId !== undefined ? { sourceId } : {}),
        // Phân biệt "không gửi" (undefined -> giữ nguyên) vs gửi null (đặt về kế thừa Nguồn cha).
        ...(data.skipPool !== undefined ? { skipPool: data.skipPool } : {}),
      },
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_GROUPS);
    return result;
  }

  /**
   * Đổi nguồn cha cho nhiều nhóm cùng lúc, đồng thời đồng bộ source_id của mọi lead
   * thuộc các nhóm đó sang nguồn mới (giữ nhất quán: lead.source_id luôn = nguồn cha của nhóm).
   * Bỏ qua nhóm đã sẵn ở nguồn đích. Chặn trùng tên trong nguồn đích trước khi ghi.
   */
  async bulkMove(rawGroupIds: string[], rawTargetSourceId: string) {
    if (!rawGroupIds?.length) throw new BadRequestException('Chưa chọn nhóm nào');
    const targetSourceId = await this.assertSourceExists(rawTargetSourceId);
    const groupIds = rawGroupIds.map((g) => BigInt(g));

    const groups = await this.prisma.leadGroup.findMany({ where: { id: { in: groupIds } } });
    if (groups.length !== groupIds.length) throw new BadRequestException('Một số nhóm không tồn tại');

    // Nhóm đã ở sẵn nguồn đích -> không cần đổi.
    const toMove = groups.filter((g) => g.sourceId !== targetSourceId);
    if (!toMove.length) return { moved: 0, leadsUpdated: 0 };

    await this.assertBulkNamesUnique(toMove, targetSourceId);

    const movedIds = toMove.map((g) => g.id);
    const [, leadResult] = await this.prisma.$transaction([
      this.prisma.leadGroup.updateMany({
        where: { id: { in: movedIds } },
        data: { sourceId: targetSourceId },
      }),
      this.prisma.lead.updateMany({
        where: { groupId: { in: movedIds } },
        data: { sourceId: targetSourceId },
      }),
    ]);

    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_GROUPS);
    return { moved: movedIds.length, leadsUpdated: leadResult.count };
  }

  async deactivate(id: bigint) {
    const group = await this.prisma.leadGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Không tìm thấy nhóm nguồn');
    const result = await this.prisma.leadGroup.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_LEAD_GROUPS);
    return result;
  }

  /**
   * Chặn 2 nhóm cùng tên trong cùng Nguồn. So khớp không phân biệt hoa/thường (`insensitive`);
   * input đã trim sẵn nên "Power 163" / "POWER 163" / " power 163 " bị coi là trùng.
   * `excludeId` để bỏ qua chính nhóm đang update. Backstop cứng = unique index DB (raw-indexes.sql).
   */
  private async assertNameUnique(name: string, sourceId: bigint, excludeId?: bigint): Promise<void> {
    const existing = await this.prisma.leadGroup.findFirst({
      where: {
        sourceId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Nhóm cùng tên đã tồn tại trong nguồn này');
  }

  /**
   * Chặn trùng tên khi dời hàng loạt vào nguồn đích: vừa so với nhóm đã có trong nguồn đích,
   * vừa so giữa các nhóm trong batch với nhau. So khớp không phân biệt hoa/thường (đã trim sẵn từ DB).
   */
  private async assertBulkNamesUnique(
    groups: { id: bigint; name: string }[],
    targetSourceId: bigint,
  ): Promise<void> {
    const movedIds = groups.map((g) => g.id);
    // Nhóm đang có sẵn trong nguồn đích (loại trừ chính các nhóm đang dời).
    const existing = await this.prisma.leadGroup.findMany({
      where: { sourceId: targetSourceId, isActive: true, id: { notIn: movedIds } },
      select: { name: true },
    });
    const taken = new Set(existing.map((g) => g.name.trim().toLowerCase()));

    const conflicts: string[] = [];
    const seenInBatch = new Set<string>();
    for (const g of groups) {
      const key = g.name.trim().toLowerCase();
      // Trùng với nhóm có sẵn trong nguồn đích, hoặc trùng với nhóm khác trong cùng batch.
      if (taken.has(key) || seenInBatch.has(key)) conflicts.push(g.name);
      seenInBatch.add(key);
    }
    if (conflicts.length) {
      throw new ConflictException(`Tên nhóm bị trùng trong nguồn đích: ${conflicts.join(', ')}`);
    }
  }

  /** Nguồn cha phải tồn tại; trả về BigInt id đã parse. */
  private async assertSourceExists(rawSourceId: string): Promise<bigint> {
    const sourceId = BigInt(rawSourceId);
    const source = await this.prisma.leadSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new BadRequestException('Nguồn cha không tồn tại');
    return sourceId;
  }
}
