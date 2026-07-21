import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { TopNItem, TopNResponse } from '@crm/types';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_TTL } from '../../common/cache/cache.constants';
import { SQL_REVENUE_TOTAL } from '../../common/constants/revenue-filter';

/** 1 dòng trong bảng "Nguồn lead" (block 1 dashboard admin). */
export interface SourceQualityItem {
  sourceId: string | null;
  source: string;
  leads: number;
  returningPct: number;
  converted: number;
  cvRate: number;
  revenue: number;
  orderCount: number;
  revenuePerOrder: number;
}

export interface TierDistributionItem {
  tierId: string | null;
  name: string;
  color: string | null;
  emoji: string | null;
  iconKey: string | null;
  customerCount: number;
  totalSpend: number;
  avgSpend: number;
}

export interface TierMovementResponse {
  total: number;
  items: { fromTierId: string | null; from: string; toTierId: string | null; to: string; count: number }[];
}

export interface ConversionByHourItem {
  bucket: string;
  leads: number;
  converted: number;
  cvRate: number;
}

export interface ReceivablesData {
  // Cong no: tong tien con thieu cua moi don chua thu du (theo created_at trong ky)
  debtAmount: number;
  debtOrderCount: number;
  // So sanh tien da xac minh (VERIFIED) vs cho duyet (PENDING) trong ky
  verifiedAmount: number;
  pendingAmount: number;
}

/**
 * Service cho các block phân tích mới của dashboard admin (Nguồn lead, Sản phẩm,
 * Thanh toán, Hạng khách, lát cắt mở rộng). Tách khỏi DashboardService vì file đó
 * đã ~1700 dòng. Tất cả method đều MANAGER+ (controller guard) nên không cần
 * buildAccessFilter - thấy toàn bộ data như các endpoint revenue/* hiện có.
 *
 * Chuẩn doanh thu: doanh thu TONG (VERIFIED+REJECTED) vi day la dashboard admin tong hop cong ty.
 * Order chi can chua xoa (deleted_at IS NULL) - khong con filter theo order.status.
 */
@Injectable()
export class DashboardBlocksService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  /** Cache key deterministic - cùng format với DashboardService.cacheKey. */
  private cacheKey(method: string, ...parts: (string | number | Date | undefined)[]): string {
    const raw = parts.map(p => (p instanceof Date ? p.toISOString() : String(p ?? 'null'))).join(':');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return `dashboard:${method}:${Math.abs(hash).toString(36)}`;
  }

  /**
   * Bảng chất lượng nguồn lead: lead + % khách cũ + CV% (cohort lead tạo trong kỳ)
   * kết hợp doanh thu VERIFIED trong kỳ attribution theo orders.lead_id -> leads.source_id.
   * Hai cohort khác basis (lead theo created_at, tiền theo verified_at) - đồng bộ với
   * convention dashboard hiện tại ("doanh thu trong kỳ" luôn theo verified_at).
   * Top 10 nguồn theo lead DESC + gộp "Khác"; doanh thu của đơn không gắn lead
   * hiển thị dòng riêng "Không gắn nguồn" (leads=0) để cảnh báo attribution gap.
   */
  async getSourceQuality(from: Date, to: Date): Promise<SourceQualityItem[]> {
    const key = this.cacheKey('source-quality', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const [leadRows, revRows] = await Promise.all([
        // % khách cũ: phone lead trùng customer tồn tại TRƯỚC lead.created_at
        // (cùng logic getNewVsReturning; phone đã normalize ở write path).
        this.prisma.$queryRaw<{
          source_id: bigint | null; source_name: string; leads: bigint; converted: bigint; returning: bigint;
        }[]>`
          WITH kperiod AS (
            SELECT l.id, l.source_id, l.status, l.phone, l.created_at
            FROM leads l
            WHERE l.deleted_at IS NULL AND l.created_at >= ${from} AND l.created_at <= ${to}
          ),
          -- Khách cũ: 1 lần scan customers cho các phone xuất hiện trong kỳ,
          -- lấy created_at sớm nhất mỗi phone -> thay correlated EXISTS per-lead.
          first_cust AS (
            SELECT c.phone, MIN(c.created_at) AS first_at
            FROM customers c
            WHERE c.deleted_at IS NULL AND c.phone IS NOT NULL AND c.phone <> ''
              AND c.phone IN (SELECT phone FROM kperiod WHERE phone IS NOT NULL AND phone <> '')
            GROUP BY c.phone
          )
          SELECT k.source_id, COALESCE(ls.name, 'Không rõ') AS source_name,
            COUNT(*)::bigint AS leads,
            COUNT(*) FILTER (WHERE k.status = 'CONVERTED')::bigint AS converted,
            COUNT(*) FILTER (WHERE fc.first_at IS NOT NULL AND fc.first_at < k.created_at)::bigint AS returning
          FROM kperiod k
          LEFT JOIN lead_sources ls ON ls.id = k.source_id
          LEFT JOIN first_cust fc ON fc.phone = k.phone
          GROUP BY k.source_id, ls.name
          ORDER BY leads DESC
        `,
        // Doanh thu TONG (VERIFIED+REJECTED) - attribution theo nguon lead (vi cong ty).
        this.prisma.$queryRaw<{
          source_id: bigint | null; source_name: string | null; no_lead: boolean; revenue: bigint; order_count: bigint;
        }[]>`
          SELECT l.source_id, ls.name AS source_name, (o.lead_id IS NULL) AS no_lead,
            COALESCE(SUM(p.amount), 0)::bigint AS revenue,
            COUNT(DISTINCT o.id)::bigint AS order_count
          FROM payments p
          JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          LEFT JOIN leads l ON l.id = o.lead_id
          LEFT JOIN lead_sources ls ON ls.id = l.source_id
          WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          GROUP BY l.source_id, ls.name, (o.lead_id IS NULL)
        `,
      ]);

      // Key revenue theo source: 'no-lead' riêng vs source_id (null = lead không có nguồn).
      // revNames giữ tên nguồn cho trường hợp nguồn có tiền verify trong kỳ
      // nhưng KHÔNG có lead mới trong kỳ (lead tạo trước kỳ) - vẫn phải hiện dòng.
      const revMap = new Map<string, { revenue: number; orderCount: number }>();
      const revNames = new Map<string, string>();
      for (const r of revRows) {
        const k = r.no_lead ? 'no-lead' : (r.source_id?.toString() ?? 'null-src');
        const prev = revMap.get(k) ?? { revenue: 0, orderCount: 0 };
        revMap.set(k, { revenue: prev.revenue + Number(r.revenue), orderCount: prev.orderCount + Number(r.order_count) });
        if (!r.no_lead) revNames.set(k, r.source_name ?? 'Không rõ');
      }

      const toItem = (
        sourceId: string | null, source: string,
        leads: number, converted: number, returning: number,
        rev: { revenue: number; orderCount: number },
      ): SourceQualityItem => ({
        sourceId, source, leads,
        returningPct: leads > 0 ? Math.round((returning / leads) * 1000) / 10 : 0,
        converted,
        cvRate: leads > 0 ? Math.round((converted / leads) * 1000) / 10 : 0,
        revenue: rev.revenue,
        orderCount: rev.orderCount,
        revenuePerOrder: rev.orderCount > 0 ? Math.round(rev.revenue / rev.orderCount) : 0,
      });

      const TOP_N = 10;
      const all = leadRows.map(r => {
        const k = r.source_id?.toString() ?? 'null-src';
        return toItem(
          r.source_id?.toString() ?? null, r.source_name,
          Number(r.leads), Number(r.converted), Number(r.returning),
          revMap.get(k) ?? { revenue: 0, orderCount: 0 },
        );
      });

      const items = all.slice(0, TOP_N);
      const rest = all.slice(TOP_N);
      if (rest.length > 0) {
        const sum = (f: (i: SourceQualityItem) => number) => rest.reduce((s, i) => s + f(i), 0);
        const leads = sum(i => i.leads);
        const converted = sum(i => i.converted);
        const returning = sum(i => (i.returningPct * i.leads) / 100);
        items.push(toItem(null, 'Khác', leads, converted, Math.round(returning), {
          revenue: sum(i => i.revenue), orderCount: sum(i => i.orderCount),
        }));
      }

      // Nguồn có doanh thu trong kỳ nhưng không có lead mới trong kỳ
      // (lead cohort theo created_at, tiền theo verified_at - 2 basis khác nhau).
      // Không append sẽ làm tổng cột DT hụt so với tổng verified -> phải hiện dòng leads=0.
      const consumed = new Set(leadRows.map(r => r.source_id?.toString() ?? 'null-src'));
      for (const [k, rev] of revMap) {
        if (k === 'no-lead' || consumed.has(k) || rev.revenue === 0) continue;
        items.push(toItem(k === 'null-src' ? null : k, revNames.get(k) ?? 'Không rõ', 0, 0, 0, rev));
      }

      const noLead = revMap.get('no-lead');
      if (noLead && noLead.revenue > 0) {
        items.push(toItem(null, 'Không gắn nguồn', 0, 0, 0, noLead));
      }
      return items;
    });
  }

  /**
   * Doanh thu theo danh mục sản phẩm (products.category_id -> product_categories).
   * Bucket null (đơn không gắn SP hoặc SP chưa có danh mục) = 'Chưa gắn danh mục',
   * giữ RIÊNG cuối danh sách, KHÔNG gộp vào "Khác" - FE style cảnh báo đỏ.
   */
  async getRevenueByProductCategory(from: Date, to: Date): Promise<TopNResponse> {
    const key = this.cacheKey('rev-by-product-category', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Doanh thu TONG (VERIFIED+REJECTED) - tong hop theo danh muc SP (vi cong ty).
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>`
        SELECT pc.id, pc.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(DISTINCT o.id)::bigint AS order_count
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN products prod ON prod.id = o.product_id
        LEFT JOIN product_categories pc ON pc.id = prod.category_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY pc.id, pc.name
        ORDER BY revenue DESC, pc.name ASC NULLS LAST
      `;

      const total = rows.reduce((s, r) => s + Number(r.revenue), 0);
      if (rows.length === 0 || total === 0) {
        return { items: [], other: null, total: 0, totalGroups: 0 };
      }
      const pctOf = (rev: number) => Math.round((rev / total) * 1000) / 10;
      const mk = (id: string | null, name: string, revenue: number, orderCount: number): TopNItem =>
        ({ id, name, revenue, orderCount, pct: pctOf(revenue) });

      const named = rows.filter(r => r.id !== null);
      const nullRow = rows.find(r => r.id === null);

      const TOP_N = 5;
      const items: TopNItem[] = named.slice(0, TOP_N)
        .map(r => mk(r.id!.toString(), r.name ?? 'Không rõ', Number(r.revenue), Number(r.order_count)));
      const rest = named.slice(TOP_N);
      let other: TopNResponse['other'] = null;
      if (rest.length > 0) {
        const otherRevenue = rest.reduce((s, r) => s + Number(r.revenue), 0);
        const otherCount = rest.reduce((s, r) => s + Number(r.order_count), 0);
        items.push(mk(null, 'Khác', otherRevenue, otherCount));
        other = { count: rest.length, revenue: otherRevenue, pct: pctOf(otherRevenue) };
      }
      if (nullRow && Number(nullRow.revenue) > 0) {
        items.push(mk(null, 'Chưa gắn danh mục', Number(nullRow.revenue), Number(nullRow.order_count)));
      }
      return { items, other, total, totalGroups: named.length + (nullRow ? 1 : 0) };
    });
  }

  /**
   * Phân bố khách theo hạng (toàn thời gian, KHÔNG theo range - hạng là trạng thái hiện tại).
   * totalSpend dùng customers.total_spent (denormalized SUM payment VERIFIED).
   */
  async getTierDistribution(): Promise<TierDistributionItem[]> {
    const key = this.cacheKey('tier-distribution');
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{
        id: bigint | null; name: string | null; color: string | null; emoji: string | null; icon_key: string | null;
        customer_count: bigint; total_spend: bigint;
      }[]>`
        SELECT ct.id, ct.name, ct.color, ct.emoji, ct.icon_key,
          COUNT(c.id)::bigint AS customer_count,
          COALESCE(SUM(c.total_spent), 0)::bigint AS total_spend
        FROM customers c
        LEFT JOIN customer_tiers ct ON ct.id = c.current_tier_id
        WHERE c.deleted_at IS NULL
        GROUP BY ct.id, ct.name, ct.color, ct.emoji, ct.icon_key, ct.sort_order
        ORDER BY ct.sort_order ASC NULLS LAST
      `;
      return rows.map(r => {
        const customerCount = Number(r.customer_count);
        const totalSpend = Number(r.total_spend);
        return {
          tierId: r.id?.toString() ?? null,
          name: r.name ?? 'Chưa xếp hạng',
          color: r.color, emoji: r.emoji, iconKey: r.icon_key,
          customerCount, totalSpend,
          avgSpend: customerCount > 0 ? Math.round(totalSpend / customerCount) : 0,
        };
      });
    });
  }

  /**
   * Dịch chuyển hạng trong kỳ: đếm activity TIER_CHANGE group theo (fromTierId -> toTierId).
   * Metadata do CustomerTierRecalcService ghi: { fromTierId, toTierId, totalSpent } (string | null).
   */
  async getTierMovement(from: Date, to: Date): Promise<TierMovementResponse> {
    const key = this.cacheKey('tier-movement', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const [rows, tiers] = await Promise.all([
        this.prisma.$queryRaw<{ from_id: string | null; to_id: string | null; count: bigint }[]>`
          SELECT a.metadata->>'fromTierId' AS from_id, a.metadata->>'toTierId' AS to_id, COUNT(*)::bigint AS count
          FROM activities a
          WHERE a.type = 'TIER_CHANGE' AND a.deleted_at IS NULL
            AND a.created_at >= ${from} AND a.created_at <= ${to}
          GROUP BY 1, 2
          ORDER BY count DESC
        `,
        this.prisma.customerTier.findMany({ select: { id: true, name: true } }),
      ]);
      const nameOf = (id: string | null) =>
        id ? (tiers.find(t => t.id.toString() === id)?.name ?? 'Không rõ') : 'Chưa xếp hạng';
      const items = rows.map(r => ({
        fromTierId: r.from_id, from: nameOf(r.from_id),
        toTierId: r.to_id, to: nameOf(r.to_id),
        count: Number(r.count),
      }));
      return { total: items.reduce((s, i) => s + i.count, 0), items };
    });
  }

  /**
   * CV% theo khung giờ TẠO lead (giờ VN). Cohort: lead tạo trong kỳ,
   * converted = status CONVERTED hiện tại (bất kể convert lúc nào) - cùng cohort
   * convention với getLeadsBySource/getNewVsReturning.
   */
  async getConversionByHour(from: Date, to: Date): Promise<ConversionByHourItem[]> {
    const key = this.cacheKey('conversion-by-hour', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ bucket: string; leads: bigint; converted: bigint }[]>`
        SELECT CASE
            WHEN h >= 8 AND h < 11 THEN '8-11h'
            WHEN h >= 11 AND h < 14 THEN '11-14h'
            WHEN h >= 14 AND h < 18 THEN '14-18h'
            WHEN h >= 18 AND h < 22 THEN '18-22h'
            ELSE 'Khác' END AS bucket,
          COUNT(*)::bigint AS leads,
          COUNT(*) FILTER (WHERE status = 'CONVERTED')::bigint AS converted
        FROM (
          -- created_at là timestamp KHÔNG tz (lưu UTC) nên phải convert 2 bước:
          -- AT TIME ZONE 'UTC' gắn nhãn UTC -> AT TIME ZONE 'Asia/Ho_Chi_Minh' đổi sang giờ VN.
          -- Dạng 1 bước (ts AT TIME ZONE 'VN') hiểu NGƯỢC (coi ts là giờ VN) - ra giờ sai.
          SELECT EXTRACT(HOUR FROM (l.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS h, l.status
          FROM leads l
          WHERE l.deleted_at IS NULL AND l.created_at >= ${from} AND l.created_at <= ${to}
        ) sub
        GROUP BY 1
      `;
      const map = new Map(rows.map(r => [r.bucket, { leads: Number(r.leads), converted: Number(r.converted) }]));
      const buckets = ['8-11h', '11-14h', '14-18h', '18-22h', 'Khác'];
      return buckets.map(bucket => {
        const v = map.get(bucket) ?? { leads: 0, converted: 0 };
        return {
          bucket, leads: v.leads, converted: v.converted,
          cvRate: v.leads > 0 ? Math.round((v.converted / v.leads) * 1000) / 10 : 0,
        };
      });
    });
  }

  /**
   * Cong no + so sanh tien xac minh vs cho duyet (block Thanh toan).
   *
   * - Cong no (debt): MOI don tao trong ky chua thu du tien that (VERIFIED+REJECTED),
   *   KE CA don chua tra dong nao (LEFT JOIN). debtAmount = tong (total_amount - da thu).
   *   Dung "tien that" de nhat quan voi auto-COMPLETED (SUM VERIFIED+REJECTED >= total).
   * - verifiedAmount: tien da xac minh (VERIFIED) theo verified_at trong ky.
   * - pendingAmount: tien cho duyet (PENDING) theo created_at trong ky (PENDING chua co verified_at).
   * Khong filter order.status vi Order chi con PENDING/COMPLETED.
   */
  async getReceivables(from: Date, to: Date): Promise<ReceivablesData> {
    const key = this.cacheKey('receivables', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const debtRows = await this.prisma.$queryRaw<{ order_count: bigint; debt_amount: bigint }[]>`
        SELECT COUNT(*)::bigint AS order_count,
          COALESCE(SUM(total_amount - paid_sum), 0)::bigint AS debt_amount
        FROM (
          SELECT o.id, o.total_amount,
            COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('VERIFIED', 'REJECTED')), 0) AS paid_sum
          FROM orders o
          LEFT JOIN payments p ON p.order_id = o.id
          WHERE o.deleted_at IS NULL
            AND o.created_at >= ${from} AND o.created_at <= ${to}
          GROUP BY o.id, o.total_amount
          HAVING COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('VERIFIED', 'REJECTED')), 0) < o.total_amount
        ) sub
      `;
      const statusRows = await this.prisma.$queryRaw<{ verified_amount: bigint; pending_amount: bigint }[]>`
        SELECT
          COALESCE(SUM(p.amount) FILTER (
            WHERE p.status = 'VERIFIED' AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          ), 0)::bigint AS verified_amount,
          COALESCE(SUM(p.amount) FILTER (
            WHERE p.status = 'PENDING' AND p.created_at >= ${from} AND p.created_at <= ${to}
          ), 0)::bigint AS pending_amount
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        WHERE (p.verified_at >= ${from} AND p.verified_at <= ${to})
           OR (p.created_at >= ${from} AND p.created_at <= ${to})
      `;
      const d = debtRows[0];
      const s = statusRows[0];
      return {
        debtOrderCount: Number(d?.order_count ?? 0),
        debtAmount: Number(d?.debt_amount ?? 0),
        verifiedAmount: Number(s?.verified_amount ?? 0),
        pendingAmount: Number(s?.pending_amount ?? 0),
      };
    });
  }
}
