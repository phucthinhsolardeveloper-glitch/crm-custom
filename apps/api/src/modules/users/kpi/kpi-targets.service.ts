import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole, UserKpiTarget } from '@prisma/client';
import { KpiTargetsRepository } from './kpi-targets.repository';
import { UpsertKpiTargetsDto } from './dto/upsert-kpi-targets.dto';
import {
  KpiTargetsResponse,
  KpiActualResponse,
  KpiTargetsYearItem,
} from './dto/kpi-targets-response.dto';
import { CacheService } from '../../../common/cache/cache.service';
import { CACHE_TTL } from '../../../common/cache/cache.constants';

type Actor = { id: bigint; role: UserRole };

@Injectable()
export class KpiTargetsService {
  constructor(
    private readonly repo: KpiTargetsRepository,
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Quy tắc xem KPI:
   * - SUPER_ADMIN / MANAGER: xem KPI bất kỳ user.
   * - USER: chỉ xem KPI của chính mình.
   */
  private assertCanRead(actor: Actor, targetUserId: bigint) {
    if (actor.role === UserRole.USER && actor.id !== targetUserId) {
      throw new ForbiddenException('Không có quyền xem KPI người khác');
    }
  }

  async getOne(actor: Actor, userId: bigint, year: number): Promise<KpiTargetsResponse | null> {
    this.assertCanRead(actor, userId);
    const row = await this.repo.findOne(userId, year);
    if (!row) return null;
    return this.toResponse(row);
  }

  async listYears(actor: Actor, userId: bigint): Promise<KpiTargetsYearItem[]> {
    this.assertCanRead(actor, userId);
    const rows = await this.repo.findByUser(userId);
    return rows.map(r => ({
      year: r.year,
      targetYearly: r.targetYearly?.toString() ?? null,
    }));
  }

  async upsert(
    actor: Actor,
    userId: bigint,
    year: number,
    dto: UpsertKpiTargetsDto,
  ): Promise<KpiTargetsResponse> {
    // Verify target user tồn tại - tránh tạo orphan KPI cho user đã xóa.
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User không tồn tại');

    const row = await this.repo.upsert(userId, year, dto, actor.id);
    // Invalidate cache actual cho user + năm này (tránh stale sau khi thay đổi target).
    await this.cacheService.del(this.actualCacheKey(userId, year));
    return this.toResponse(row);
  }

  async remove(userId: bigint, year: number) {
    const row = await this.repo.findOne(userId, year);
    if (!row) throw new NotFoundException('KPI không tồn tại');
    await this.repo.remove(userId, year);
    await this.cacheService.del(this.actualCacheKey(userId, year));
    return { message: 'Đã xóa KPI' };
  }

  /**
   * Actual revenue user theo năm. SUM payments.amount WHERE status=VERIFIED,
   * group by month theo timezone Asia/Ho_Chi_Minh.
   * Join orders.created_by để attribute đúng cho user tạo order (last-touch).
   * Cache 5 phút.
   */
  async getActual(actor: Actor, userId: bigint, year: number): Promise<KpiActualResponse> {
    this.assertCanRead(actor, userId);

    return this.cacheService.getOrSet(
      this.actualCacheKey(userId, year),
      CACHE_TTL.MEDIUM,
      async () => {
        const rows = await this.prisma.$queryRaw<{ month: number; revenue: bigint }[]>`
          SELECT EXTRACT(MONTH FROM ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int as month,
                 COALESCE(SUM(p.amount), 0)::bigint as revenue
          FROM payments p
          JOIN orders o ON o.id = p.order_id
          WHERE p.status = 'VERIFIED'
            AND o.created_by = ${userId}
            AND EXTRACT(YEAR FROM ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')) = ${year}
          GROUP BY month
          ORDER BY month
        `;

        const monthly: Record<number, number> = {};
        for (let i = 1; i <= 12; i++) monthly[i] = 0;
        let yearly = 0;
        for (const r of rows) {
          const amt = Number(r.revenue);
          monthly[r.month] = amt;
          yearly += amt;
        }

        return { userId: userId.toString(), year, yearly, monthly };
      },
    );
  }

  private actualCacheKey(userId: bigint, year: number) {
    return `kpi:actual:${userId}:${year}`;
  }

  private toResponse(row: UserKpiTarget): KpiTargetsResponse {
    return {
      userId: row.userId.toString(),
      year: row.year,
      targetYearly: row.targetYearly?.toString() ?? null,
      targetJan: row.targetJan?.toString() ?? null,
      targetFeb: row.targetFeb?.toString() ?? null,
      targetMar: row.targetMar?.toString() ?? null,
      targetApr: row.targetApr?.toString() ?? null,
      targetMay: row.targetMay?.toString() ?? null,
      targetJun: row.targetJun?.toString() ?? null,
      targetJul: row.targetJul?.toString() ?? null,
      targetAug: row.targetAug?.toString() ?? null,
      targetSep: row.targetSep?.toString() ?? null,
      targetOct: row.targetOct?.toString() ?? null,
      targetNov: row.targetNov?.toString() ?? null,
      targetDec: row.targetDec?.toString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
