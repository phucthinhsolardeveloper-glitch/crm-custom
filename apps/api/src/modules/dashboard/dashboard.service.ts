import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  REVENUE_TOTAL_STATUSES,
  REVENUE_SALE_STATUSES,
  SQL_REVENUE_TOTAL,
  SQL_REVENUE_SALE,
} from '../../common/constants/revenue-filter';
import type {
  TopNResponse, TopNItem,
  DailyByGroupResponse, DailyByGroupSeries,
  SankeyRevenueResponse, SankeyNode, SankeyLink,
} from '@crm/types';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_TTL } from '../../common/cache/cache.constants';
import { collapseTopN } from '../../common/utils/collapse-top-n';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  /** Deterministic cache key from parts. Dùng full ISO để phân biệt range cùng ngày khác giờ. */
  private cacheKey(method: string, ...parts: (string | number | bigint | Date | undefined | null)[]): string {
    const raw = parts.map(p => {
      if (p instanceof Date) return p.toISOString();
      return String(p ?? 'null');
    }).join(':');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return `dashboard:${method}:${Math.abs(hash).toString(36)}`;
  }

  /**
   * Tính range kỳ ngay trước (cùng độ dài).
   * VD from=2026-06-01, to=2026-06-30 -> prevFrom=2026-05-02, prevTo=2026-06-01
   */
  private getPrevPeriod(from: Date, to: Date): { prevFrom: Date; prevTo: Date } {
    const ms = to.getTime() - from.getTime();
    return {
      prevFrom: new Date(from.getTime() - ms),
      prevTo: new Date(from.getTime()),
    };
  }

  /**
   * Trend % so kỳ trước. Trả `null` khi previous=0 (div-by-zero) để FE hiển thị "-".
   * Round 1 chữ số sau dấu phẩy.
   */
  private computeTrendPct(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  async getStats(userId: bigint, role: string, dateFrom?: Date, dateTo?: Date, teamId?: bigint | null) {
    const key = this.cacheKey('stats', userId, role, dateFrom, dateTo, teamId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      // LEADER giữ team thấy data toàn team (scope theo teamId); còn lại self-scope như USER.
      const isTeam = role === 'LEADER' && teamId != null;
      const now = new Date();
      const from = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1);
      const to = dateTo || now;

      const orderScope = isTeam ? { creator: { teamId } } : { createdBy: userId };
      const userLead = isAdmin ? {} : isTeam ? { assignedUser: { teamId } } : { assignedUserId: userId };
      const userOrder = isAdmin ? {} : orderScope;
      const userCustomer = isAdmin ? {} : isTeam ? { assignedUser: { teamId } } : { assignedUserId: userId };
      const userTask = isAdmin ? {} : isTeam ? { assignee: { teamId } } : { assignedTo: userId };
      const userPayment = isAdmin ? {} : { order: orderScope };
      const dateRange = { gte: from, lte: to };

      const [newLeads, inProgress, converted, revenueAgg, newCustomers, totalOrders, pendingPayments, overdueTask] = await Promise.all([
        // Leads mới: tất cả lead tạo trong kỳ (bất kể status hiện tại).
        // Đồng bộ với "KH cũ vs KH mới" denominator để CV rate cohort = converted / newLeads có nghĩa.
        this.prisma.lead.count({ where: { deletedAt: null, ...userLead, createdAt: dateRange } }),
        this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'IN_PROGRESS' } }),
        this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'CONVERTED', updatedAt: dateRange } }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          // Doanh thu: admin = TỔNG (VERIFIED+REJECTED, ví công ty); user/team = SALE (VERIFIED, KPI cá nhân).
          where: {
            status: { in: isAdmin ? REVENUE_TOTAL_STATUSES : REVENUE_SALE_STATUSES },
            verifiedAt: dateRange,
            order: {
              ...(isAdmin ? {} : orderScope),
              deletedAt: null,
            },
          },
        }),
        this.prisma.customer.count({ where: { deletedAt: null, ...userCustomer, createdAt: dateRange } }),
        this.prisma.order.count({ where: { deletedAt: null, ...userOrder, createdAt: dateRange } }),
        this.prisma.payment.count({ where: { ...userPayment, status: 'PENDING' } }),
        this.prisma.task.count({
          where: { deletedAt: null, status: 'PENDING', ...userTask, dueDate: { lt: now } },
        }),
      ]);

      return {
        newLeads, inProgress, converted,
        revenue: Number(revenueAgg._sum.amount ?? 0),
        newCustomers, totalOrders, pendingPayments, overdueTask,
      };
    });
  }

  /**
   * Lead status breakdown for funnel chart - cohort filter theo createdAt trong kỳ.
   * Cohort align với KPI "Leads mới" và "Chất lượng nguồn lead" - cùng total trong kỳ,
   * khác cách nhóm (status hiện tại vs nguồn).
   */
  async getLeadFunnel(userId: bigint, role: string, dateFrom?: Date, dateTo?: Date, teamId?: bigint | null) {
    const key = this.cacheKey('funnel', userId, role, dateFrom, dateTo, teamId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      const isTeam = role === 'LEADER' && teamId != null;
      const dateFilter = dateFrom && dateTo ? { createdAt: { gte: dateFrom, lte: dateTo } } : {};
      const leadScope = isAdmin ? {} : isTeam ? { assignedUser: { teamId } } : { assignedUserId: userId };
      const baseWhere = { deletedAt: null, ...leadScope, ...dateFilter };

      const groups = await this.prisma.lead.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: true,
      });

      const countMap = new Map(groups.map(g => [g.status, g._count]));
      const statuses = ['POOL', 'ZOOM', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING'] as const;
      return statuses.map(status => ({ status, count: countMap.get(status) || 0 }));
    });
  }

  /** Daily revenue trend for a date range */
  async getRevenueTrend(userId: bigint, role: string, dateFrom: Date, dateTo: Date, teamId?: bigint | null) {
    const key = this.cacheKey('revenue', userId, role, dateFrom, dateTo, teamId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      const isTeam = role === 'LEADER' && teamId != null;
      const userFilter = isAdmin
        ? Prisma.sql``
        : isTeam
          ? Prisma.sql`AND o.created_by IN (SELECT id FROM users WHERE team_id = ${teamId} AND deleted_at IS NULL)`
          : Prisma.sql`AND o.created_by = ${userId}`;

      // Group theo ngày Việt Nam (UTC+7) thay vì UTC để không bị shift cột sau 17:00 VN.
      // Admin = TỔNG (VERIFIED+REJECTED, ví công ty); user/team = SALE (VERIFIED, KPI cá nhân).
      const revFilter = isAdmin ? SQL_REVENUE_TOTAL : SQL_REVENUE_SALE;
      const rows = await this.prisma.$queryRaw<{ day: Date; revenue: bigint }[]>`
        SELECT ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date as day,
               COALESCE(SUM(p.amount), 0)::bigint as revenue
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        WHERE ${revFilter}
          AND p.verified_at >= ${dateFrom}
          AND p.verified_at <= ${dateTo}
          ${userFilter}
        GROUP BY ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ORDER BY day
      `;

      return rows.map(r => ({ day: r.day, revenue: Number(r.revenue) }));
    });
  }

  /**
   * Manager+: top performers by orders + revenue in period.
   * Converted = orders created by user (last-touch). Cartesian-product fixed.
   */
  async getTopPerformers(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('top', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Doanh so SALE (VERIFIED only) - rank theo user, dung cho leaderboard/KPI ca nhan.
      const rows = await this.prisma.$queryRaw<{ user_id: bigint; name: string; converted: bigint; revenue: bigint }[]>`
        SELECT u.id as user_id, u.name,
          (SELECT COUNT(*)::bigint FROM orders o
           WHERE o.created_by = u.id AND o.deleted_at IS NULL
             AND o.created_at >= ${dateFrom} AND o.created_at <= ${dateTo}) as converted,
          (SELECT COALESCE(SUM(p.amount), 0)::bigint
           FROM payments p
           JOIN orders o2 ON o2.id = p.order_id AND o2.deleted_at IS NULL
           WHERE o2.created_by = u.id
             AND ${SQL_REVENUE_SALE}
             AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}) as revenue
        FROM users u
        WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER')
        ORDER BY revenue DESC
        LIMIT 10
      `;
      // Filter out zero-activity users (HAVING-equivalent)
      return rows
        .filter(r => Number(r.converted) > 0 || Number(r.revenue) > 0)
        .map(r => ({ userId: r.user_id.toString(), name: r.name, converted: Number(r.converted), revenue: Number(r.revenue) }));
    });
  }

  /** Manager+: leads per source in period */
  async getLeadsBySource(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('sources', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ source_name: string; total: bigint; converted: bigint }[]>`
        SELECT COALESCE(ls.name, 'Không rõ') as source_name,
          COUNT(l.id)::bigint as total,
          COUNT(CASE WHEN l.status = 'CONVERTED' THEN 1 END)::bigint as converted
        FROM leads l
        LEFT JOIN lead_sources ls ON ls.id = l.source_id
        WHERE l.deleted_at IS NULL AND l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo}
        GROUP BY ls.name
        ORDER BY total DESC
      `;
      return rows.map(r => ({
        source: r.source_name, total: Number(r.total), converted: Number(r.converted),
        rate: Number(r.total) > 0 ? Math.round(Number(r.converted) / Number(r.total) * 100) : 0,
      }));
    });
  }

  /** Manager+: daily conversion rate trend (new leads vs converted) */
  async getConversionTrend(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('conv', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Cast created_at/updated_at sang ngày VN trước khi so sánh với generate_series.
      // generate_series tự cast Date param sang ngày UTC - giữ nguyên cho bound, nhưng so sánh row đã ép TZ.
      const rows = await this.prisma.$queryRaw<{ day: Date; new_leads: bigint; converted: bigint }[]>`
        SELECT d.day,
          COALESCE(SUM(CASE WHEN ((l.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day THEN 1 ELSE 0 END), 0)::bigint as new_leads,
          COALESCE(SUM(CASE WHEN l.status = 'CONVERTED' AND ((l.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day THEN 1 ELSE 0 END), 0)::bigint as converted
        FROM generate_series(${dateFrom}::date, ${dateTo}::date, '1 day'::interval) d(day)
        LEFT JOIN leads l ON l.deleted_at IS NULL AND (
          ((l.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day
          OR (l.status = 'CONVERTED' AND ((l.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day)
        )
        GROUP BY d.day ORDER BY d.day
      `;
      return rows.map(r => ({
        day: r.day,
        newLeads: Number(r.new_leads),
        converted: Number(r.converted),
      }));
    });
  }

  /** Manager+: lead aging - how many leads haven't been interacted with */
  async getLeadAging(userId: bigint, role: string, teamId?: bigint | null) {
    const key = this.cacheKey('aging', userId, role, teamId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      const isTeam = role === 'LEADER' && teamId != null;
      const userFilter = isAdmin
        ? Prisma.sql``
        : isTeam
          ? Prisma.sql`AND l.assigned_user_id IN (SELECT id FROM users WHERE team_id = ${teamId} AND deleted_at IS NULL)`
          : Prisma.sql`AND l.assigned_user_id = ${userId}`;

      const rows = await this.prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
        SELECT
          CASE
            WHEN age <= 1 THEN '0-1 ngày'
            WHEN age <= 3 THEN '1-3 ngày'
            WHEN age <= 7 THEN '3-7 ngày'
            ELSE '7+ ngày'
          END as bucket,
          COUNT(*)::bigint as count
        FROM (
          SELECT EXTRACT(DAY FROM NOW() - GREATEST(l.updated_at, COALESCE(la.last_activity, l.updated_at))) as age
          FROM leads l
          LEFT JOIN LATERAL (
            SELECT MAX(a.created_at) as last_activity
            FROM activities a
            WHERE a.entity_type = 'LEAD' AND a.entity_id = l.id AND a.deleted_at IS NULL
          ) la ON true
          WHERE l.deleted_at IS NULL AND l.status IN ('IN_PROGRESS', 'ASSIGNED')
          ${userFilter}
        ) sub
        GROUP BY bucket
        ORDER BY MIN(age)
      `;
      const countMap = new Map(rows.map(r => [r.bucket, Number(r.count)]));
      const buckets = ['0-1 ngày', '1-3 ngày', '3-7 ngày', '7+ ngày'];
      return buckets.map(b => ({ bucket: b, count: countMap.get(b) || 0 }));
    });
  }

  /**
   * Lead mới phân loại "KH cũ vs KH mới":
   * - KH cũ = phone của lead trùng với customer đã tồn tại TRƯỚC lead.created_at
   * - KH mới = phone không match customer nào trước đó
   * Trả thêm convert breakdown (CV rate theo nhóm) để dashboard so sánh.
   *
   * `customers.phone` và `leads.phone` đều được normalize ở write path (normalizePhone util)
   * nên compare trực tiếp = để dùng index btree @@index([phone]) trên customers.phone.
   * Lead thiếu phone bị loại khỏi denominator (không xác định được KH cũ hay mới).
   */
  async getNewVsReturning(userId: bigint, role: string, dateFrom: Date, dateTo: Date, teamId?: bigint | null) {
    const key = this.cacheKey('newvsret', userId, role, dateFrom, dateTo, teamId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      const isTeam = role === 'LEADER' && teamId != null;
      const leadUserFilter = isAdmin
        ? Prisma.sql``
        : isTeam
          ? Prisma.sql`AND l.assigned_user_id IN (SELECT id FROM users WHERE team_id = ${teamId} AND deleted_at IS NULL)`
          : Prisma.sql`AND l.assigned_user_id = ${userId}`;
      const orderUserFilter = isAdmin
        ? Prisma.sql``
        : isTeam
          ? Prisma.sql`AND o.created_by IN (SELECT id FROM users WHERE team_id = ${teamId} AND deleted_at IS NULL)`
          : Prisma.sql`AND o.created_by = ${userId}`;

      // 2 query song song: leads breakdown + revenue/customers breakdown.
      // Tách query vì userFilter khác base table (leads vs orders).
      const [leadRows, revRows] = await Promise.all([
        this.prisma.$queryRaw<{
          total: bigint; new_count: bigint; returning_count: bigint;
          converted: bigint; conv_new: bigint; conv_returning: bigint;
        }[]>`
          WITH kperiod AS (
            SELECT l.id, l.status, l.phone, l.created_at
            FROM leads l
            WHERE l.deleted_at IS NULL
              AND l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo}
              AND l.phone IS NOT NULL AND l.phone <> ''
              ${leadUserFilter}
          ),
          -- Khách cũ: 1 lần scan customers cho các phone trong kỳ (MIN created_at),
          -- thay correlated EXISTS chạy per-lead.
          first_cust AS (
            SELECT c.phone, MIN(c.created_at) AS first_at
            FROM customers c
            WHERE c.deleted_at IS NULL AND c.phone IS NOT NULL AND c.phone <> ''
              AND c.phone IN (SELECT phone FROM kperiod)
            GROUP BY c.phone
          ),
          leads_in_period AS (
            SELECT k.id, k.status,
              (fc.first_at IS NOT NULL AND fc.first_at < k.created_at) as is_returning
            FROM kperiod k
            LEFT JOIN first_cust fc ON fc.phone = k.phone
          )
          SELECT
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE NOT is_returning)::bigint as new_count,
            COUNT(*) FILTER (WHERE is_returning)::bigint as returning_count,
            COUNT(*) FILTER (WHERE status = 'CONVERTED')::bigint as converted,
            COUNT(*) FILTER (WHERE status = 'CONVERTED' AND NOT is_returning)::bigint as conv_new,
            COUNT(*) FILTER (WHERE status = 'CONVERTED' AND is_returning)::bigint as conv_returning
          FROM leads_in_period
        `,
        // KH mới = customer.created_at IN kỳ; KH cũ = customer.created_at < dateFrom.
        // Count DISTINCT customer_id để 1 KH nhiều order chỉ tính 1 lần.
        // Admin = TỔNG (ví công ty, breakdown KH mới/cũ toàn hệ thống); user/team = SALE (KPI cá nhân).
        this.prisma.$queryRaw<{
          rev_new: bigint; rev_ret: bigint;
          cust_new: bigint; cust_ret: bigint;
        }[]>`
          WITH payments_in_period AS (
            SELECT p.amount, c.id as customer_id,
              (c.created_at >= ${dateFrom} AND c.created_at <= ${dateTo}) as is_new_customer
            FROM payments p
            JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
            JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
            WHERE ${isAdmin ? SQL_REVENUE_TOTAL : SQL_REVENUE_SALE}
              AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}
              ${orderUserFilter}
          )
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE is_new_customer), 0)::bigint as rev_new,
            COALESCE(SUM(amount) FILTER (WHERE NOT is_new_customer), 0)::bigint as rev_ret,
            COUNT(DISTINCT customer_id) FILTER (WHERE is_new_customer)::bigint as cust_new,
            COUNT(DISTINCT customer_id) FILTER (WHERE NOT is_new_customer)::bigint as cust_ret
          FROM payments_in_period
        `,
      ]);

      const r = leadRows[0] || { total: 0n, new_count: 0n, returning_count: 0n, converted: 0n, conv_new: 0n, conv_returning: 0n };
      const rev = revRows[0] || { rev_new: 0n, rev_ret: 0n, cust_new: 0n, cust_ret: 0n };
      const newCount = Number(r.new_count);
      const returningCount = Number(r.returning_count);
      const convNew = Number(r.conv_new);
      const convReturning = Number(r.conv_returning);
      const revNew = Number(rev.rev_new);
      const revRet = Number(rev.rev_ret);
      const custNew = Number(rev.cust_new);
      const custRet = Number(rev.cust_ret);

      return {
        newLeads: {
          total: Number(r.total),
          fromNew: newCount,
          fromReturning: returningCount,
        },
        converts: {
          total: Number(r.converted),
          fromNew: convNew,
          fromReturning: convReturning,
          cvRateFromNew: newCount > 0 ? Math.round((convNew / newCount) * 1000) / 10 : 0,
          cvRateFromReturning: returningCount > 0 ? Math.round((convReturning / returningCount) * 1000) / 10 : 0,
        },
        revenue: {
          total: revNew + revRet,
          fromNew: revNew,
          fromReturning: revRet,
        },
        customers: {
          total: custNew + custRet,
          fromNew: custNew,
          fromReturning: custRet,
        },
      };
    });
  }

  /**
   * Manager+: revenue + leads per department.
   *
   * Uses correlated subqueries to avoid Cartesian product (previous version
   * had `JOIN leads + JOIN orders + JOIN payments` which inflated revenue
   * by the number of leads per user).
   */
  async getDeptPerformance(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('dept', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Doanh thu TONG (VERIFIED+REJECTED) - tong hop theo phong ban (vi cong ty).
      const rows = await this.prisma.$queryRaw<{ dept_id: bigint; dept_name: string; revenue: bigint; leads: bigint; converted: bigint }[]>`
        SELECT d.id as dept_id, d.name as dept_name,
          (SELECT COALESCE(SUM(p.amount), 0)::bigint
           FROM payments p
           JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
           JOIN users u ON u.id = o.created_by AND u.department_id = d.id AND u.deleted_at IS NULL
           WHERE ${SQL_REVENUE_TOTAL}
             AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}) as revenue,
          (SELECT COUNT(*)::bigint
           FROM leads l
           JOIN users u2 ON u2.id = l.assigned_user_id AND u2.department_id = d.id AND u2.deleted_at IS NULL
           WHERE l.deleted_at IS NULL
             AND l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo}) as leads,
          (SELECT COUNT(*)::bigint
           FROM orders o3
           JOIN users u3 ON u3.id = o3.created_by AND u3.department_id = d.id AND u3.deleted_at IS NULL
           WHERE o3.deleted_at IS NULL
             AND o3.created_at >= ${dateFrom} AND o3.created_at <= ${dateTo}) as converted
        FROM departments d
        WHERE d.deleted_at IS NULL
        ORDER BY revenue DESC
      `;
      return rows.map(r => ({
        deptId: r.dept_id.toString(), name: r.dept_name,
        revenue: Number(r.revenue), leads: Number(r.leads), converted: Number(r.converted),
      }));
    });
  }

  /**
   * Manager+: revenue + leads per team within a department (or all).
   * Same Cartesian-product fix as getDeptPerformance - uses correlated subqueries.
   */
  async getTeamPerformance(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('team', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ team_id: bigint; team_name: string; dept_name: string; revenue: bigint; leads: bigint; converted: bigint; members: bigint }[]>`
        SELECT t.id as team_id, t.name as team_name, d.name as dept_name,
          (SELECT COUNT(*)::bigint FROM users u
           WHERE u.team_id = t.id AND u.deleted_at IS NULL) as members,
          -- Doanh thu TONG (VERIFIED+REJECTED) - tong hop theo team (vi cong ty).
          (SELECT COALESCE(SUM(p.amount), 0)::bigint
           FROM payments p
           JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
           JOIN users u ON u.id = o.created_by AND u.team_id = t.id AND u.deleted_at IS NULL
           WHERE ${SQL_REVENUE_TOTAL}
             AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}) as revenue,
          (SELECT COUNT(*)::bigint
           FROM leads l
           JOIN users u2 ON u2.id = l.assigned_user_id AND u2.team_id = t.id AND u2.deleted_at IS NULL
           WHERE l.deleted_at IS NULL
             AND l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo}) as leads,
          (SELECT COUNT(*)::bigint
           FROM orders o3
           JOIN users u3 ON u3.id = o3.created_by AND u3.team_id = t.id AND u3.deleted_at IS NULL
           WHERE o3.deleted_at IS NULL
             AND o3.created_at >= ${dateFrom} AND o3.created_at <= ${dateTo}) as converted
        FROM teams t
        JOIN departments d ON d.id = t.department_id
        WHERE t.deleted_at IS NULL
        ORDER BY revenue DESC
      `;
      return rows.map(r => ({
        teamId: r.team_id.toString(), name: r.team_name, dept: r.dept_name,
        revenue: Number(r.revenue), leads: Number(r.leads), converted: Number(r.converted), members: Number(r.members),
      }));
    });
  }

  /**
   * Manager+: employee scorecard - all metrics needed for score calculation.
   *
   * Counting rules (agreed with PM):
   * - leads_assigned: COUNT of assignment_history records where to_user_id = NV in period.
   *   → If lead transferred A→B, both A and B get +1 (counts each receive event).
   * - leads_converted: COUNT of orders NV created in period (created_by + created_at).
   * - revenue: SUM of VERIFIED payments verified in period, from orders NV created.
   * - overdue_tasks: PENDING tasks past due (current state, not period-bound).
   * - aging_leads_7d: leads currently held by NV, untouched 7+ days (current state).
   * - tasks_total / tasks_completed: tasks created in period.
   */
  async getEmployeeScores(dateFrom: Date, dateTo: Date, departmentIds?: bigint[], teamId?: bigint | null) {
    const key = this.cacheKey('emp-scores', dateFrom, dateTo, departmentIds?.join(','), teamId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const deptFilter = departmentIds?.length
        ? Prisma.sql`AND u.department_id IN (${Prisma.join(departmentIds)})`
        : Prisma.sql``;
      // Team scope cho trang "Team của tôi" (LEADER). Khi null không thêm filter.
      const teamFilter = teamId != null
        ? Prisma.sql`AND u.team_id = ${teamId}`
        : Prisma.sql``;

      const rows = await this.prisma.$queryRaw<{
        user_id: bigint; name: string; dept_name: string | null; dept_id: bigint | null;
        leads_assigned: bigint; leads_converted: bigint; revenue: bigint; net_revenue: bigint;
        overdue_tasks: bigint; aging_leads_7d: bigint;
        tasks_total: bigint; tasks_completed: bigint;
        orders_count: bigint; products_count: bigint; untouched_leads: bigint;
        interactions: bigint;
      }[]>`
        SELECT
          u.id as user_id, u.name,
          d.name as dept_name, d.id as dept_id,
          -- Leads nhận trong kỳ: mỗi lần nhận = 1 count (transfer A→B → cả A và B đều +1)
          (SELECT COUNT(*)::bigint FROM assignment_history ah
           WHERE ah.entity_type = 'LEAD' AND ah.to_user_id = u.id
             AND ah.created_at >= ${dateFrom} AND ah.created_at <= ${dateTo}) as leads_assigned,
          -- Convert trong kỳ: orders NV tạo trong kỳ (last-touch attribution)
          (SELECT COUNT(*)::bigint FROM orders o
           WHERE o.created_by = u.id AND o.deleted_at IS NULL
             AND o.created_at >= ${dateFrom} AND o.created_at <= ${dateTo}) as leads_converted,
          -- Doanh so SALE cho bang NV: xep theo NGAY CK THAT (transfer_date), tinh ca PENDING chua xac minh.
          -- Ly do: don CK ngay 15 nhung xac minh ngay 20 phai hien khi loc ngay 15 (verified_at gay lech ky + rot PENDING).
          (SELECT COALESCE(SUM(p.amount), 0)::bigint FROM payments p
           JOIN orders o2 ON o2.id = p.order_id
           WHERE o2.created_by = u.id AND o2.deleted_at IS NULL
             AND p.status IN ('VERIFIED', 'PENDING')
             AND p.transfer_date >= ${dateFrom} AND p.transfer_date <= ${dateTo}) as revenue,
          -- Doanh thu thuan: revenue - VAT nam trong so tien (gia SP da gom VAT). Cung co so ngay CK + PENDING nhu tren.
          (SELECT COALESCE(SUM(p.amount - p.amount * o2.vat_rate / (100 + o2.vat_rate)), 0)::bigint FROM payments p
           JOIN orders o2 ON o2.id = p.order_id
           WHERE o2.created_by = u.id AND o2.deleted_at IS NULL
             AND p.status IN ('VERIFIED', 'PENDING')
             AND p.transfer_date >= ${dateFrom} AND p.transfer_date <= ${dateTo}) as net_revenue,
          -- Tasks quá hạn (current state, không filter period)
          (SELECT COUNT(*)::bigint FROM tasks t
           WHERE t.assigned_to = u.id AND t.deleted_at IS NULL
             AND t.status = 'PENDING' AND t.due_date < NOW()) as overdue_tasks,
          -- Leads aging: đang giữ + IN_PROGRESS/ASSIGNED + 7+ ngày không tương tác
          (SELECT COUNT(*)::bigint FROM leads al
           WHERE al.assigned_user_id = u.id AND al.deleted_at IS NULL
             AND al.status IN ('IN_PROGRESS', 'ASSIGNED')
             AND al.updated_at < NOW() - INTERVAL '7 days') as aging_leads_7d,
          -- Tasks total/completed trong kỳ (cho task completion rate)
          (SELECT COUNT(*)::bigint FROM tasks t2
           WHERE t2.assigned_to = u.id AND t2.deleted_at IS NULL
             AND t2.created_at >= ${dateFrom} AND t2.created_at <= ${dateTo}) as tasks_total,
          (SELECT COUNT(*)::bigint FROM tasks t3
           WHERE t3.assigned_to = u.id AND t3.deleted_at IS NULL
             AND t3.status = 'COMPLETED'
             AND t3.created_at >= ${dateFrom} AND t3.created_at <= ${dateTo}) as tasks_completed,
          -- Số đơn NV tạo trong kỳ (alias clearer name; same data as leads_converted nhưng strong intent)
          (SELECT COUNT(*)::bigint FROM orders oc
           WHERE oc.created_by = u.id AND oc.deleted_at IS NULL
             AND oc.created_at >= ${dateFrom} AND oc.created_at <= ${dateTo}) as orders_count,
          -- Số sản phẩm: count orders có product_id (mỗi order có 1 product). Schema không có order_items.
          (SELECT COUNT(*)::bigint FROM orders op
           WHERE op.created_by = u.id AND op.deleted_at IS NULL
             AND op.product_id IS NOT NULL
             AND op.created_at >= ${dateFrom} AND op.created_at <= ${dateTo}) as products_count,
          -- Lead chưa tác nghiệp: assigned cho NV, KHÔNG có activity nào (note/call/order) trên lead đó
          (SELECT COUNT(*)::bigint FROM leads ul
           WHERE ul.assigned_user_id = u.id AND ul.deleted_at IS NULL
             AND ul.last_assigned_at >= ${dateFrom} AND ul.last_assigned_at <= ${dateTo}
             AND NOT EXISTS (
               SELECT 1 FROM activities a
               WHERE a.entity_type = 'LEAD' AND a.entity_id = ul.id
                 AND a.deleted_at IS NULL
             )) as untouched_leads,
          -- Lượt tương tác: COUNT DISTINCT (lead, ngày VN) khi user note hoặc đổi nhãn.
          -- 1 lead × 1 ngày = 1 lượt dù note 10 lần hoặc đổi nhãn 5 lần trong ngày đó.
          (SELECT COUNT(*)::bigint FROM (
             SELECT DISTINCT ai.entity_id, ((ai.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
             FROM activities ai
             WHERE ai.user_id = u.id
               AND ai.entity_type = 'LEAD'
               AND ai.type IN ('NOTE', 'LABEL_CHANGE')
               AND ai.deleted_at IS NULL
               AND ai.created_at >= ${dateFrom} AND ai.created_at <= ${dateTo}
           ) sub) as interactions
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER', 'MANAGER') AND u.status = 'ACTIVE'
          ${deptFilter}
          ${teamFilter}
        ORDER BY revenue DESC
      `;

      return rows.map(r => ({
        userId: r.user_id.toString(),
        name: r.name,
        deptName: r.dept_name || 'Chưa phân phòng',
        deptId: r.dept_id?.toString() || null,
        leadsAssigned: Number(r.leads_assigned),
        leadsConverted: Number(r.leads_converted),
        revenue: Number(r.revenue),
        netRevenue: Number(r.net_revenue),
        overdueTasks: Number(r.overdue_tasks),
        agingLeads7d: Number(r.aging_leads_7d),
        tasksTotal: Number(r.tasks_total),
        tasksCompleted: Number(r.tasks_completed),
        ordersCount: Number(r.orders_count),
        productsCount: Number(r.products_count),
        untouchedLeads: Number(r.untouched_leads),
        interactions: Number(r.interactions),
      }));
    });
  }

  /**
   * Manager+: per-user call aggregation (Báo cáo cuộc gọi tab).
   *
   * Counting rules:
   * - callsAnswered: OUTGOING + INCOMING với duration > 0 (cuộc thực sự nói chuyện)
   * - callsOutgoing: tất cả OUTGOING (kể cả không nghe máy)
   * - outgoingTotalSeconds: SUM(duration) where OUTGOING
   * - outgoingAvgSeconds: AVG(duration) where OUTGOING AND duration > 0
   */
  async getEmployeeCallReport(dateFrom: Date, dateTo: Date, departmentIds?: bigint[]) {
    const key = this.cacheKey('emp-calls', dateFrom, dateTo, departmentIds?.join(','));
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const deptFilter = departmentIds?.length
        ? Prisma.sql`AND u.department_id IN (${Prisma.join(departmentIds)})`
        : Prisma.sql``;

      const rows = await this.prisma.$queryRaw<{
        user_id: bigint; name: string; dept_name: string | null;
        calls_answered: bigint; calls_outgoing: bigint;
        outgoing_total_seconds: bigint; outgoing_avg_seconds: number;
      }[]>`
        SELECT
          u.id as user_id, u.name,
          d.name as dept_name,
          COALESCE(SUM(
            CASE WHEN c.call_type IN ('OUTGOING', 'INCOMING') AND c.duration > 0
                 THEN 1 ELSE 0 END
          ), 0)::bigint as calls_answered,
          COALESCE(SUM(
            CASE WHEN c.call_type = 'OUTGOING' THEN 1 ELSE 0 END
          ), 0)::bigint as calls_outgoing,
          COALESCE(SUM(
            CASE WHEN c.call_type = 'OUTGOING' THEN c.duration ELSE 0 END
          ), 0)::bigint as outgoing_total_seconds,
          COALESCE(AVG(
            CASE WHEN c.call_type = 'OUTGOING' AND c.duration > 0 THEN c.duration END
          ), 0)::float as outgoing_avg_seconds
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN call_logs c
          ON c.matched_user_id = u.id
          AND c.deleted_at IS NULL
          AND c.call_time >= ${dateFrom} AND c.call_time <= ${dateTo}
        WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER', 'MANAGER') AND u.status = 'ACTIVE'
          ${deptFilter}
        GROUP BY u.id, u.name, d.name
        ORDER BY calls_outgoing DESC
      `;

      return rows.map(r => ({
        userId: r.user_id.toString(),
        name: r.name,
        deptName: r.dept_name || 'Chưa phân phòng',
        callsAnswered: Number(r.calls_answered),
        callsOutgoing: Number(r.calls_outgoing),
        outgoingTotalSeconds: Number(r.outgoing_total_seconds),
        outgoingAvgSeconds: Math.round(Number(r.outgoing_avg_seconds)),
      }));
    });
  }

  /**
   * Manager+: per-user sales breakdown with dynamic top 7 labels.
   *
   * Logic:
   * 1. Find top 7 labels by total customer count (whole DB, not filtered by date).
   *    Filter is_active=true để loại label đã ngừng dùng. Schema KHÔNG có labels.deleted_at.
   * 2. For each user, count customers per label in top 7, plus "other" (labels ngoài top 7)
   *    và "untouched" (lead user đang giữ chưa có outgoing call duration > 0).
   *
   * Range filter áp dụng cho customer.created_at (KH tạo trong kỳ) và lead.last_assigned_at (lead đang giữ).
   */
  async getEmployeeSalesBreakdown(dateFrom: Date, dateTo: Date, departmentIds?: bigint[]) {
    const key = this.cacheKey('emp-sales', dateFrom, dateTo, departmentIds?.join(','));
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Step 1: top 7 labels theo total count toàn DB (không filter time)
      const topLabelsRows = await this.prisma.$queryRaw<{
        id: bigint; name: string; color: string; text_color: string;
      }[]>`
        SELECT l.id, l.name, l.color, l.text_color
        FROM labels l
        JOIN customer_labels cl ON cl.label_id = l.id
        JOIN customers c ON c.id = cl.customer_id
        WHERE l.is_active = true
          AND c.deleted_at IS NULL
        GROUP BY l.id, l.name, l.color, l.text_color
        ORDER BY COUNT(cl.customer_id) DESC
        LIMIT 7
      `;

      const topLabels = topLabelsRows.map(l => ({
        id: l.id.toString(),
        name: l.name,
        color: l.color,
        textColor: l.text_color,
      }));
      const topLabelIds = topLabelsRows.map(l => l.id);

      const deptFilter = departmentIds?.length
        ? Prisma.sql`AND u.department_id IN (${Prisma.join(departmentIds)})`
        : Prisma.sql``;

      // Step 2: per-user breakdown
      // labelCounts: chỉ count customer có ≥1 label trong top 7 (assigned cho user)
      // otherCount: customer của user có label NHƯNG không có label nào trong top 7
      // untouchedCount: lead user đang giữ chưa có outgoing call > 0 trong kỳ
      const topLabelIdsArray = topLabelIds.length > 0
        ? Prisma.sql`ARRAY[${Prisma.join(topLabelIds)}]::bigint[]`
        : Prisma.sql`ARRAY[]::bigint[]`;

      const rows = await this.prisma.$queryRaw<{
        user_id: bigint; name: string; dept_name: string | null;
        label_counts: Record<string, number> | null;
        other_count: bigint; untouched_count: bigint;
      }[]>`
        WITH top_label_ids AS (
          SELECT unnest(${topLabelIdsArray}) AS label_id
        ),
        user_label_counts AS (
          SELECT
            c.assigned_user_id,
            cl.label_id,
            COUNT(DISTINCT c.id) AS cnt
          FROM customers c
          JOIN customer_labels cl ON cl.customer_id = c.id
          WHERE c.deleted_at IS NULL
            AND c.created_at >= ${dateFrom} AND c.created_at <= ${dateTo}
            AND c.assigned_user_id IS NOT NULL
          GROUP BY c.assigned_user_id, cl.label_id
        ),
        user_other_count AS (
          SELECT
            c.assigned_user_id,
            COUNT(DISTINCT c.id) AS cnt
          FROM customers c
          WHERE c.deleted_at IS NULL
            AND c.created_at >= ${dateFrom} AND c.created_at <= ${dateTo}
            AND c.assigned_user_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM customer_labels cl
              WHERE cl.customer_id = c.id
                AND cl.label_id NOT IN (SELECT label_id FROM top_label_ids)
            )
            AND NOT EXISTS (
              SELECT 1 FROM customer_labels cl
              WHERE cl.customer_id = c.id
                AND cl.label_id IN (SELECT label_id FROM top_label_ids)
            )
          GROUP BY c.assigned_user_id
        ),
        user_untouched AS (
          SELECT
            l.assigned_user_id,
            COUNT(*) AS cnt
          FROM leads l
          WHERE l.deleted_at IS NULL
            AND l.assigned_user_id IS NOT NULL
            AND l.last_assigned_at >= ${dateFrom} AND l.last_assigned_at <= ${dateTo}
            AND NOT EXISTS (
              SELECT 1 FROM call_logs cl
              WHERE cl.matched_entity_type = 'LEAD' AND cl.matched_entity_id = l.id
                AND cl.call_type = 'OUTGOING' AND cl.duration > 0
                AND cl.deleted_at IS NULL
            )
          GROUP BY l.assigned_user_id
        )
        SELECT
          u.id as user_id, u.name, d.name as dept_name,
          (
            SELECT jsonb_object_agg(ulc.label_id::text, ulc.cnt)
            FROM user_label_counts ulc
            WHERE ulc.assigned_user_id = u.id
              AND ulc.label_id IN (SELECT label_id FROM top_label_ids)
          ) AS label_counts,
          COALESCE((SELECT cnt FROM user_other_count uoc WHERE uoc.assigned_user_id = u.id), 0)::bigint AS other_count,
          COALESCE((SELECT cnt FROM user_untouched uu WHERE uu.assigned_user_id = u.id), 0)::bigint AS untouched_count
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER', 'MANAGER') AND u.status = 'ACTIVE'
          ${deptFilter}
        ORDER BY u.name
      `;

      return {
        topLabels,
        rows: rows.map(r => {
          const lc: Record<string, number> = {};
          if (r.label_counts) {
            for (const [k, v] of Object.entries(r.label_counts)) {
              lc[k] = Number(v);
            }
          }
          return {
            userId: r.user_id.toString(),
            name: r.name,
            deptName: r.dept_name || 'Chưa phân phòng',
            labelCounts: lc,
            otherCount: Number(r.other_count),
            untouchedCount: Number(r.untouched_count),
          };
        }),
      };
    });
  }

  /**
   * Drill-down: paginated customer list for a user + filter mode.
   *
   * Modes (mutually exclusive):
   * - labelId: customers của user có gắn label X
   * - untouched=true: leads của user chưa có outgoing call duration > 0
   * - other=true (cả labelId và untouched đều undefined/false): customers của user có label nhưng KHÔNG nằm trong top 7
   */
  async getEmployeeSalesBreakdownCustomers(params: {
    userId: bigint;
    labelId?: bigint;
    untouched?: boolean;
    other?: boolean;
    dateFrom: Date;
    dateTo: Date;
    cursor?: bigint;
    limit?: number;
  }) {
    const { userId, labelId, untouched, other, dateFrom, dateTo, cursor } = params;
    const limit = Math.min(params.limit ?? 50, 200);

    // Untouched mode → lead list
    if (untouched) {
      const cursorFilter = cursor ? Prisma.sql`AND l.id < ${cursor}` : Prisma.sql``;
      const rows = await this.prisma.$queryRaw<{
        id: bigint; name: string; phone: string;
        last_activity_at: Date | null;
      }[]>`
        SELECT l.id, l.name, l.phone,
          (SELECT MAX(a.created_at) FROM activities a
           WHERE a.entity_type = 'LEAD' AND a.entity_id = l.id AND a.deleted_at IS NULL) as last_activity_at
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.assigned_user_id = ${userId}
          AND l.last_assigned_at >= ${dateFrom} AND l.last_assigned_at <= ${dateTo}
          AND NOT EXISTS (
            SELECT 1 FROM call_logs cl
            WHERE cl.matched_entity_type = 'LEAD' AND cl.matched_entity_id = l.id
              AND cl.call_type = 'OUTGOING' AND cl.duration > 0
              AND cl.deleted_at IS NULL
          )
          ${cursorFilter}
        ORDER BY l.id DESC
        LIMIT ${limit + 1}
      `;

      const totalRow = await this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint as total
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.assigned_user_id = ${userId}
          AND l.last_assigned_at >= ${dateFrom} AND l.last_assigned_at <= ${dateTo}
          AND NOT EXISTS (
            SELECT 1 FROM call_logs cl
            WHERE cl.matched_entity_type = 'LEAD' AND cl.matched_entity_id = l.id
              AND cl.call_type = 'OUTGOING' AND cl.duration > 0
              AND cl.deleted_at IS NULL
          )
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return {
        data: items.map(r => ({
          id: r.id.toString(),
          name: r.name,
          phone: r.phone,
          labels: [],
          lastActivityAt: r.last_activity_at?.toISOString() || null,
          ordersCount: 0,
          totalRevenue: 0,
        })),
        cursor: hasMore ? items[items.length - 1].id.toString() : null,
        total: Number(totalRow[0]?.total ?? 0),
      };
    }

    // Customer list mode (labelId or other)
    // Common filters
    const customerFilters: Prisma.Sql[] = [
      Prisma.sql`c.deleted_at IS NULL`,
      Prisma.sql`c.assigned_user_id = ${userId}`,
      Prisma.sql`c.created_at >= ${dateFrom}`,
      Prisma.sql`c.created_at <= ${dateTo}`,
    ];

    if (labelId) {
      customerFilters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM customer_labels cl
        WHERE cl.customer_id = c.id AND cl.label_id = ${labelId}
      )`);
    } else if (other) {
      // "Other" mode: customer có label nhưng KHÔNG nằm trong top 7
      // Cần re-query top 7 để filter chính xác
      const topLabelsRows = await this.prisma.$queryRaw<{ id: bigint }[]>`
        SELECT l.id
        FROM labels l
        JOIN customer_labels cl ON cl.label_id = l.id
        JOIN customers c ON c.id = cl.customer_id
        WHERE l.is_active = true AND c.deleted_at IS NULL
        GROUP BY l.id
        ORDER BY COUNT(cl.customer_id) DESC
        LIMIT 7
      `;
      const topIds = topLabelsRows.map(r => r.id);
      const topIdsSql = topIds.length > 0
        ? Prisma.sql`ARRAY[${Prisma.join(topIds)}]::bigint[]`
        : Prisma.sql`ARRAY[]::bigint[]`;
      customerFilters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM customer_labels cl
        WHERE cl.customer_id = c.id AND cl.label_id != ALL(${topIdsSql})
      )`);
      customerFilters.push(Prisma.sql`NOT EXISTS (
        SELECT 1 FROM customer_labels cl2
        WHERE cl2.customer_id = c.id AND cl2.label_id = ANY(${topIdsSql})
      )`);
    }

    // Cursor filter chỉ áp cho query list, KHÔNG cho count
    const baseWhereSql = Prisma.join(customerFilters, ' AND ');
    const listWhereSql = cursor
      ? Prisma.sql`${baseWhereSql} AND c.id < ${cursor}`
      : baseWhereSql;

    const rows = await this.prisma.$queryRaw<{
      id: bigint; name: string; phone: string;
      labels: { id: string; name: string; color: string }[] | null;
      last_activity_at: Date | null;
      orders_count: bigint; total_revenue: bigint;
    }[]>`
      SELECT c.id, c.name, c.phone,
        (
          SELECT jsonb_agg(jsonb_build_object('id', l.id::text, 'name', l.name, 'color', l.color))
          FROM customer_labels cl JOIN labels l ON l.id = cl.label_id
          WHERE cl.customer_id = c.id
        ) AS labels,
        (
          SELECT MAX(a.created_at)
          FROM activities a
          WHERE a.entity_type = 'CUSTOMER' AND a.entity_id = c.id AND a.deleted_at IS NULL
        ) AS last_activity_at,
        (
          SELECT COUNT(*)::bigint FROM orders o
          WHERE o.customer_id = c.id AND o.deleted_at IS NULL
        ) AS orders_count,
        -- Tong chi tieu cua KH (vi cong ty = TONG VERIFIED+REJECTED). Dung de hien thi tren drilldown label, khong phai KPI ca nhan.
        (
          SELECT COALESCE(SUM(p.amount), 0)::bigint
          FROM payments p
          JOIN orders o2 ON o2.id = p.order_id
          WHERE o2.customer_id = c.id AND o2.deleted_at IS NULL
            AND (p.status = 'VERIFIED' OR p.status = 'REJECTED')
        ) AS total_revenue
      FROM customers c
      WHERE ${listWhereSql}
      ORDER BY c.id DESC
      LIMIT ${limit + 1}
    `;

    const totalRow = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
      FROM customers c
      WHERE ${baseWhereSql}
    `;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: items.map(r => ({
        id: r.id.toString(),
        name: r.name,
        phone: r.phone,
        labels: r.labels || [],
        lastActivityAt: r.last_activity_at?.toISOString() || null,
        ordersCount: Number(r.orders_count),
        totalRevenue: Number(r.total_revenue),
      })),
      cursor: hasMore ? items[items.length - 1].id.toString() : null,
      total: Number(totalRow[0]?.total ?? 0),
    };
  }

  // ── Revenue dashboard endpoints (no-quota) ────────────────────────────
  // 5 method dưới phục vụ trang /dashboard/revenue redesign.
  // Pattern: tính kỳ hiện tại + kỳ trước (cùng độ dài) -> compute trendPct.

  /**
   * KPI overview cho trang revenue: 3 metric chính + spark 7 điểm cuối.
   * KHÔNG có AOV (theo spec no-quota).
   */
  async getRevenueOverview(from: Date, to: Date) {
    const key = this.cacheKey('rev-overview', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const { prevFrom, prevTo } = this.getPrevPeriod(from, to);

      // 4 query song song: 2 aggregate (current + prev) + spark trend daily
      const [curr, prev, sparkRows] = await Promise.all([
        // Doanh thu TONG (VERIFIED+REJECTED) - KPI overview toan cong ty.
        this.prisma.$queryRaw<{ revenue: bigint; orders: bigint; new_leads: bigint; converted: bigint }[]>`
          SELECT
            (SELECT COALESCE(SUM(p.amount), 0)::bigint
             FROM payments p
             JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
             WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}) as revenue,
            (SELECT COUNT(*)::bigint FROM orders o WHERE o.deleted_at IS NULL
             AND o.created_at >= ${from} AND o.created_at <= ${to}) as orders,
            (SELECT COUNT(*)::bigint FROM leads l WHERE l.deleted_at IS NULL
             AND l.created_at >= ${from} AND l.created_at <= ${to}) as new_leads,
            (SELECT COUNT(*)::bigint FROM leads l WHERE l.deleted_at IS NULL
             AND l.status = 'CONVERTED' AND l.updated_at >= ${from} AND l.updated_at <= ${to}) as converted
        `,
        this.prisma.$queryRaw<{ revenue: bigint; orders: bigint; new_leads: bigint; converted: bigint }[]>`
          SELECT
            (SELECT COALESCE(SUM(p.amount), 0)::bigint
             FROM payments p
             JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
             WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${prevFrom} AND p.verified_at <= ${prevTo}) as revenue,
            (SELECT COUNT(*)::bigint FROM orders o WHERE o.deleted_at IS NULL
             AND o.created_at >= ${prevFrom} AND o.created_at <= ${prevTo}) as orders,
            (SELECT COUNT(*)::bigint FROM leads l WHERE l.deleted_at IS NULL
             AND l.created_at >= ${prevFrom} AND l.created_at <= ${prevTo}) as new_leads,
            (SELECT COUNT(*)::bigint FROM leads l WHERE l.deleted_at IS NULL
             AND l.status = 'CONVERTED' AND l.updated_at >= ${prevFrom} AND l.updated_at <= ${prevTo}) as converted
        `,
        // Spark: 7 ngay cuoi cua khoang - daily revenue (TONG), orders, conv rate
        this.prisma.$queryRaw<{ day: Date; revenue: bigint; orders: bigint; new_leads: bigint; converted: bigint }[]>`
          SELECT d.day,
            COALESCE((SELECT SUM(p.amount)::bigint FROM payments p
              JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
              WHERE ${SQL_REVENUE_TOTAL}
                AND ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day), 0)::bigint as revenue,
            COALESCE((SELECT COUNT(*)::bigint FROM orders o WHERE o.deleted_at IS NULL
              AND ((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day), 0)::bigint as orders,
            COALESCE((SELECT COUNT(*)::bigint FROM leads l WHERE l.deleted_at IS NULL
              AND ((l.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day), 0)::bigint as new_leads,
            COALESCE((SELECT COUNT(*)::bigint FROM leads l WHERE l.deleted_at IS NULL
              AND l.status = 'CONVERTED'
              AND ((l.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day), 0)::bigint as converted
          FROM generate_series(GREATEST(${from}::date, ${to}::date - INTERVAL '6 days')::date, ${to}::date, '1 day'::interval) d(day)
          ORDER BY d.day
        `,
      ]);

      const c = curr[0] ?? { revenue: 0n, orders: 0n, new_leads: 0n, converted: 0n };
      const p = prev[0] ?? { revenue: 0n, orders: 0n, new_leads: 0n, converted: 0n };

      const currRevenue = Number(c.revenue);
      const currOrders = Number(c.orders);
      const currNewLeads = Number(c.new_leads);
      const currConverted = Number(c.converted);
      const currConvRate = currNewLeads > 0 ? Math.round((currConverted / currNewLeads) * 1000) / 10 : 0;

      const prevRevenue = Number(p.revenue);
      const prevOrders = Number(p.orders);
      const prevNewLeads = Number(p.new_leads);
      const prevConverted = Number(p.converted);
      const prevConvRate = prevNewLeads > 0 ? Math.round((prevConverted / prevNewLeads) * 1000) / 10 : 0;

      return {
        totalRevenue: {
          current: currRevenue,
          previous: prevRevenue,
          trendPct: this.computeTrendPct(currRevenue, prevRevenue),
        },
        totalOrders: {
          current: currOrders,
          previous: prevOrders,
          trendPct: this.computeTrendPct(currOrders, prevOrders),
        },
        convRate: {
          current: currConvRate,
          previous: prevConvRate,
          trendPct: this.computeTrendPct(currConvRate, prevConvRate),
        },
        spark: {
          revenue: sparkRows.map(r => Number(r.revenue)),
          orders: sparkRows.map(r => Number(r.orders)),
          convRate: sparkRows.map(r => {
            const nl = Number(r.new_leads);
            const cv = Number(r.converted);
            return nl > 0 ? Math.round((cv / nl) * 1000) / 10 : 0;
          }),
        },
      };
    });
  }

  /**
   * Cơ cấu doanh thu theo sản phẩm. Top 4 + gộp "Khác".
   * Chỉ tính payments VERIFIED.
   */
  async getRevenueByProduct(from: Date, to: Date) {
    const key = this.cacheKey('rev-by-product', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Doanh thu TONG (VERIFIED+REJECTED) - tong hop theo san pham (vi cong ty).
      const rows = await this.prisma.$queryRaw<{ product_id: bigint | null; name: string | null; revenue: bigint }[]>`
        SELECT prod.id as product_id, prod.name, COALESCE(SUM(p.amount), 0)::bigint as revenue
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN products prod ON prod.id = o.product_id
        WHERE ${SQL_REVENUE_TOTAL}
          AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY prod.id, prod.name
        ORDER BY revenue DESC
      `;

      const total = rows.reduce((sum, r) => sum + Number(r.revenue), 0);
      if (total === 0) return [];

      const items = rows.map(r => ({
        productId: r.product_id?.toString() ?? null,
        name: r.name ?? 'Không rõ',
        revenue: Number(r.revenue),
        pct: Math.round((Number(r.revenue) / total) * 1000) / 10,
      }));

      // Top 4 + gộp "Khác"
      if (items.length <= 5) return items;
      const top4 = items.slice(0, 4);
      const rest = items.slice(4);
      const otherRevenue = rest.reduce((s, r) => s + r.revenue, 0);
      return [
        ...top4,
        {
          productId: null,
          name: 'Khác',
          revenue: otherRevenue,
          pct: Math.round((otherRevenue / total) * 1000) / 10,
        },
      ];
    });
  }

  /**
   * Dept comparison: revenue + trend vs kỳ trước + top sale per dept.
   * Sort by revenue DESC. FE highlight phòng đầu bằng crown.
   */
  async getDeptComparison(from: Date, to: Date) {
    const key = this.cacheKey('rev-dept-comparison', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const { prevFrom, prevTo } = this.getPrevPeriod(from, to);

      const [currRows, prevRows, topSaleRows] = await Promise.all([
        // Current period: revenue (TONG - vi cong ty) + leads + orders + member count
        this.prisma.$queryRaw<{
          dept_id: bigint; dept_name: string; member_count: bigint;
          revenue: bigint; leads: bigint; orders: bigint;
        }[]>`
          SELECT d.id as dept_id, d.name as dept_name,
            (SELECT COUNT(*)::bigint FROM users u
             WHERE u.department_id = d.id AND u.deleted_at IS NULL AND u.status = 'ACTIVE') as member_count,
            (SELECT COALESCE(SUM(p.amount), 0)::bigint
             FROM payments p
             JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
             JOIN users u ON u.id = o.created_by AND u.department_id = d.id AND u.deleted_at IS NULL
             WHERE ${SQL_REVENUE_TOTAL}
               AND p.verified_at >= ${from} AND p.verified_at <= ${to}) as revenue,
            (SELECT COUNT(*)::bigint
             FROM leads l
             JOIN users u2 ON u2.id = l.assigned_user_id AND u2.department_id = d.id AND u2.deleted_at IS NULL
             WHERE l.deleted_at IS NULL
               AND l.created_at >= ${from} AND l.created_at <= ${to}) as leads,
            (SELECT COUNT(*)::bigint
             FROM orders o3
             JOIN users u3 ON u3.id = o3.created_by AND u3.department_id = d.id AND u3.deleted_at IS NULL
             WHERE o3.deleted_at IS NULL
               AND o3.created_at >= ${from} AND o3.created_at <= ${to}) as orders
          FROM departments d
          WHERE d.deleted_at IS NULL
          ORDER BY revenue DESC
        `,
        // Previous period: revenue (TONG) only - for trend calc vs prev period
        this.prisma.$queryRaw<{ dept_id: bigint; revenue: bigint }[]>`
          SELECT d.id as dept_id,
            COALESCE((SELECT SUM(p.amount)::bigint
             FROM payments p
             JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
             JOIN users u ON u.id = o.created_by AND u.department_id = d.id AND u.deleted_at IS NULL
             WHERE ${SQL_REVENUE_TOTAL}
               AND p.verified_at >= ${prevFrom} AND p.verified_at <= ${prevTo}), 0)::bigint as revenue
          FROM departments d
          WHERE d.deleted_at IS NULL
        `,
        // Top sale per dept: doanh so SALE (VERIFIED only) - rank NV de chon top 1 moi phong.
        this.prisma.$queryRaw<{ dept_id: bigint; user_id: bigint; user_name: string; user_revenue: bigint }[]>`
          WITH user_rev AS (
            SELECT
              u.department_id as dept_id,
              u.id as user_id,
              u.name as user_name,
              COALESCE(SUM(p.amount), 0)::bigint as user_revenue,
              ROW_NUMBER() OVER (PARTITION BY u.department_id ORDER BY COALESCE(SUM(p.amount), 0) DESC) as rn
            FROM users u
            LEFT JOIN orders o ON o.created_by = u.id AND o.deleted_at IS NULL
            LEFT JOIN payments p ON p.order_id = o.id AND ${SQL_REVENUE_SALE}
              AND p.verified_at >= ${from} AND p.verified_at <= ${to}
            WHERE u.deleted_at IS NULL AND u.department_id IS NOT NULL
            GROUP BY u.department_id, u.id, u.name
          )
          SELECT dept_id, user_id, user_name, user_revenue
          FROM user_rev
          WHERE rn = 1 AND user_revenue > 0
        `,
      ]);

      const prevMap = new Map(prevRows.map(r => [r.dept_id.toString(), Number(r.revenue)]));
      const topSaleMap = new Map(topSaleRows.map(r => [r.dept_id.toString(), {
        userId: r.user_id.toString(),
        name: r.user_name,
        revenue: Number(r.user_revenue),
      }]));

      return currRows.map(r => {
        const deptIdStr = r.dept_id.toString();
        const currRev = Number(r.revenue);
        const prevRev = prevMap.get(deptIdStr) ?? 0;
        const leads = Number(r.leads);
        const orders = Number(r.orders);
        return {
          deptId: deptIdStr,
          name: r.dept_name,
          memberCount: Number(r.member_count),
          revenue: currRev,
          trendPctVsPrev: this.computeTrendPct(currRev, prevRev),
          leads,
          orders,
          convRate: leads > 0 ? Math.round((orders / leads) * 1000) / 10 : 0,
          topSale: topSaleMap.get(deptIdStr) ?? null,
        };
      });
    });
  }

  /**
   * Podium top 3 NV theo revenue.
   * Reuse pattern getTopPerformers LIMIT 3 + trend vs prev.
   */
  async getRevenuePodium(from: Date, to: Date) {
    const key = this.cacheKey('rev-podium', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const { prevFrom, prevTo } = this.getPrevPeriod(from, to);

      // Doanh so SALE (VERIFIED only) - podium xep hang NV, chi tinh tien sach cua NV.
      const [currRows, prevRows] = await Promise.all([
        this.prisma.$queryRaw<{
          user_id: bigint; name: string; dept_name: string | null;
          orders_count: bigint; revenue: bigint;
        }[]>`
          SELECT u.id as user_id, u.name, d.name as dept_name,
            (SELECT COUNT(*)::bigint FROM orders o
             WHERE o.created_by = u.id AND o.deleted_at IS NULL
               AND o.created_at >= ${from} AND o.created_at <= ${to}) as orders_count,
            (SELECT COALESCE(SUM(p.amount), 0)::bigint
             FROM payments p
             JOIN orders o2 ON o2.id = p.order_id AND o2.deleted_at IS NULL
             WHERE o2.created_by = u.id
               AND ${SQL_REVENUE_SALE}
               AND p.verified_at >= ${from} AND p.verified_at <= ${to}) as revenue
          FROM users u
          LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER') AND u.status = 'ACTIVE'
          ORDER BY revenue DESC
          LIMIT 3
        `,
        this.prisma.$queryRaw<{ user_id: bigint; revenue: bigint }[]>`
          SELECT u.id as user_id,
            COALESCE((SELECT SUM(p.amount)::bigint
             FROM payments p
             JOIN orders o2 ON o2.id = p.order_id AND o2.deleted_at IS NULL
             WHERE o2.created_by = u.id
               AND ${SQL_REVENUE_SALE}
               AND p.verified_at >= ${prevFrom} AND p.verified_at <= ${prevTo}), 0)::bigint as revenue
          FROM users u
          WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER') AND u.status = 'ACTIVE'
        `,
      ]);

      const prevMap = new Map(prevRows.map(r => [r.user_id.toString(), Number(r.revenue)]));

      return currRows
        .filter(r => Number(r.revenue) > 0)
        .map((r, idx) => {
          const userIdStr = r.user_id.toString();
          const currRev = Number(r.revenue);
          const prevRev = prevMap.get(userIdStr) ?? 0;
          return {
            rank: idx + 1,
            userId: userIdStr,
            name: r.name,
            deptName: r.dept_name ?? 'Chưa phân phòng',
            revenue: currRev,
            ordersCount: Number(r.orders_count),
            trendPctVsPrev: this.computeTrendPct(currRev, prevRev),
          };
        });
    });
  }

  /**
   * Full leaderboard tất cả NV theo revenue.
   * Reuse pattern getEmployeeScores nhưng chỉ select các cột cần.
   */
  async getRevenueLeaderboard(from: Date, to: Date) {
    const key = this.cacheKey('rev-leaderboard', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const { prevFrom, prevTo } = this.getPrevPeriod(from, to);

      // Tháng/năm hiện tại theo giờ VN (UTC+7) - dùng cho cột KPI tháng.
      // KPI luôn so target + actual của THÁNG HIỆN TẠI, độc lập với range filter.
      const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const kpiYear = nowVN.getUTCFullYear();
      const kpiMonth = nowVN.getUTCMonth() + 1; // 1-12

      // Doanh so SALE (VERIFIED only) - leaderboard xep hang NV, KPI ca nhan.
      const [currRows, prevRows, kpiTargetRows, kpiActualRows] = await Promise.all([
        this.prisma.$queryRaw<{
          user_id: bigint; name: string; dept_name: string | null;
          orders_count: bigint; revenue: bigint;
        }[]>`
          SELECT u.id as user_id, u.name, d.name as dept_name,
            (SELECT COUNT(*)::bigint FROM orders o
             WHERE o.created_by = u.id AND o.deleted_at IS NULL
               AND o.created_at >= ${from} AND o.created_at <= ${to}) as orders_count,
            (SELECT COALESCE(SUM(p.amount), 0)::bigint
             FROM payments p
             JOIN orders o2 ON o2.id = p.order_id AND o2.deleted_at IS NULL
             WHERE o2.created_by = u.id
               AND ${SQL_REVENUE_SALE}
               AND p.verified_at >= ${from} AND p.verified_at <= ${to}) as revenue
          FROM users u
          LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER') AND u.status = 'ACTIVE'
          ORDER BY revenue DESC
        `,
        this.prisma.$queryRaw<{ user_id: bigint; revenue: bigint }[]>`
          SELECT u.id as user_id,
            COALESCE((SELECT SUM(p.amount)::bigint
             FROM payments p
             JOIN orders o2 ON o2.id = p.order_id AND o2.deleted_at IS NULL
             WHERE o2.created_by = u.id
               AND ${SQL_REVENUE_SALE}
               AND p.verified_at >= ${prevFrom} AND p.verified_at <= ${prevTo}), 0)::bigint as revenue
          FROM users u
          WHERE u.deleted_at IS NULL AND u.role IN ('USER', 'LEADER') AND u.status = 'ACTIVE'
        `,
        // Target KPI tháng hiện tại / user. Cột tháng động chọn qua CASE (tham số hóa,
        // không nội suy tên cột - an toàn injection). NULL = chưa set target tháng đó.
        this.prisma.$queryRaw<{ user_id: bigint; target: string | null }[]>`
          SELECT user_id, (CASE ${kpiMonth}
            WHEN 1  THEN target_jan WHEN 2  THEN target_feb WHEN 3  THEN target_mar
            WHEN 4  THEN target_apr WHEN 5  THEN target_may WHEN 6  THEN target_jun
            WHEN 7  THEN target_jul WHEN 8  THEN target_aug WHEN 9  THEN target_sep
            WHEN 10 THEN target_oct WHEN 11 THEN target_nov WHEN 12 THEN target_dec
          END) as target
          FROM user_kpi_targets WHERE year = ${kpiYear}
        `,
        // Doanh so SALE thang hien tai / user - so voi target KPI thang (chi tinh VERIFIED).
        this.prisma.$queryRaw<{ user_id: bigint; revenue: bigint }[]>`
          SELECT o.created_by as user_id, COALESCE(SUM(p.amount), 0)::bigint as revenue
          FROM payments p
          JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          WHERE ${SQL_REVENUE_SALE}
            AND EXTRACT(YEAR FROM ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')) = ${kpiYear}
            AND EXTRACT(MONTH FROM ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')) = ${kpiMonth}
          GROUP BY o.created_by
        `,
      ]);

      const prevMap = new Map(prevRows.map(r => [r.user_id.toString(), Number(r.revenue)]));
      const kpiTargetMap = new Map(
        kpiTargetRows
          .filter(r => r.target != null)
          .map(r => [r.user_id.toString(), Number(r.target)]),
      );
      const kpiActualMap = new Map(kpiActualRows.map(r => [r.user_id.toString(), Number(r.revenue)]));

      return currRows.map((r, idx) => {
        const userIdStr = r.user_id.toString();
        const currRev = Number(r.revenue);
        const prevRev = prevMap.get(userIdStr) ?? 0;
        const kpiTarget = kpiTargetMap.get(userIdStr) ?? null;
        const kpiActual = kpiActualMap.get(userIdStr) ?? 0;
        const kpiPct =
          kpiTarget && kpiTarget > 0 ? Math.round((kpiActual / kpiTarget) * 1000) / 10 : null;
        return {
          rank: idx + 1,
          userId: userIdStr,
          name: r.name,
          deptName: r.dept_name ?? 'Chưa phân phòng',
          revenue: currRev,
          ordersCount: Number(r.orders_count),
          trendPctVsPrev: this.computeTrendPct(currRev, prevRev),
          kpiTarget,
          kpiActual,
          kpiPct,
        };
      });
    });
  }

  // ── Cash Flow Decomposition (H1) ─────────────────────────────────────────
  // 6 method dưới phục vụ widget bóc tách dòng tiền theo dimension.
  // Mọi method trả TopNResponse (Top 5 + Khác) - contract với FE.
  // Pattern raw SQL: GROUP BY dimension → ORDER BY revenue DESC → collapseTopN.

  /** Helper: tính rows breakdown cho mỗi dimension và collapse Top N + Khác. */
  private async aggregateRevenueByDimension(
    rawRows: { id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[],
    topN = 5,
  ): Promise<TopNResponse> {
    return collapseTopN(
      rawRows.map(r => ({
        id: r.id?.toString() ?? null,
        name: r.name ?? 'Không rõ',
        revenue: Number(r.revenue),
        orderCount: Number(r.order_count),
      })),
      topN,
    );
  }

  /** Doanh thu TONG theo hinh thuc thanh toan (CK, Tien mat, ...). */
  async getRevenueByPaymentType(from: Date, to: Date): Promise<TopNResponse> {
    const key = this.cacheKey('rev-by-payment-type', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>`
        SELECT pt.id, pt.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(*)::bigint AS order_count
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN payment_types pt ON pt.id = p.payment_type_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY pt.id, pt.name
        ORDER BY revenue DESC, pt.name ASC NULLS LAST
      `;
      return this.aggregateRevenueByDimension(rows, 5);
    });
  }

  /** Doanh thu TONG theo hinh thuc don (Zoom phat lai, Zoom pheu, ...). */
  async getRevenueByOrderFormat(from: Date, to: Date): Promise<TopNResponse> {
    const key = this.cacheKey('rev-by-order-format', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>`
        SELECT of.id, of.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(DISTINCT o.id)::bigint AS order_count
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN order_formats of ON of.id = o.format_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY of.id, of.name
        ORDER BY revenue DESC, of.name ASC NULLS LAST
      `;
      return this.aggregateRevenueByDimension(rows, 5);
    });
  }

  /** Doanh thu TONG theo nhom san pham (Online, Tool, Offline...). */
  async getRevenueByProductGroup(from: Date, to: Date): Promise<TopNResponse> {
    const key = this.cacheKey('rev-by-product-group', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>`
        SELECT pg.id, pg.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(DISTINCT o.id)::bigint AS order_count
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN product_groups pg ON pg.id = o.product_group_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY pg.id, pg.name
        ORDER BY revenue DESC, pg.name ASC NULLS LAST
      `;
      return this.aggregateRevenueByDimension(rows, 5);
    });
  }

  /** Doanh thu TONG theo tai khoan nhan (chi apply cho CK; non-CK group thanh "Khong qua bank"). */
  async getRevenueByBankAccount(from: Date, to: Date): Promise<TopNResponse> {
    const key = this.cacheKey('rev-by-bank-account', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>`
        SELECT ba.id, COALESCE(ba.name, 'Không qua bank') AS name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(*)::bigint AS order_count
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY ba.id, ba.name
        ORDER BY revenue DESC, ba.name ASC NULLS LAST
      `;
      return this.aggregateRevenueByDimension(rows, 5);
    });
  }

  /** Doanh thu TONG theo dot thanh toan (Ck Full, Lan 1, Lan 2...). */
  async getRevenueByInstallment(from: Date, to: Date): Promise<TopNResponse> {
    const key = this.cacheKey('rev-by-installment', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>`
        SELECT pi.id, pi.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(*)::bigint AS order_count
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN payment_installments pi ON pi.id = p.installment_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY pi.id, pi.name
        ORDER BY revenue DESC, pi.name ASC NULLS LAST
      `;
      return this.aggregateRevenueByDimension(rows, 5);
    });
  }

  /** Doanh thu TONG theo tier khach (Kim Cuong, Bach Kim, Vang, Bac, Dong).
   *  TopN=10 (du chua 5-8 tier business) - khac cac dimension khac. */
  async getRevenueByTier(from: Date, to: Date): Promise<TopNResponse> {
    const key = this.cacheKey('rev-by-tier', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>`
        SELECT ct.id, ct.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(DISTINCT c.id)::bigint AS order_count
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
        LEFT JOIN customer_tiers ct ON ct.id = c.current_tier_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY ct.id, ct.name, ct.sort_order
        ORDER BY revenue DESC, ct.sort_order ASC NULLS LAST
      `;
      // order_count o day = so KH unique (DISTINCT customer_id), khong phai so don
      return this.aggregateRevenueByDimension(rows, 10);
    });
  }

  /** Drill-down: lấy items ngoài Top N cho 1 dimension. Dùng khi user click "Khác". */
  async getRevenueByDimensionItems(
    dim: 'payment-type' | 'order-format' | 'product-group' | 'bank-account' | 'installment' | 'tier',
    from: Date, to: Date, excludeTop: number,
  ): Promise<{ items: TopNItem[]; totalGroups: number }> {
    const key = this.cacheKey('rev-by-dim-items', dim, from, to, excludeTop);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Reuse base query của method tương ứng
      let baseResp: TopNResponse;
      switch (dim) {
        case 'payment-type': baseResp = await this.getRevenueByPaymentType(from, to); break;
        case 'order-format': baseResp = await this.getRevenueByOrderFormat(from, to); break;
        case 'product-group': baseResp = await this.getRevenueByProductGroup(from, to); break;
        case 'bank-account': baseResp = await this.getRevenueByBankAccount(from, to); break;
        case 'installment': baseResp = await this.getRevenueByInstallment(from, to); break;
        case 'tier': baseResp = await this.getRevenueByTier(from, to); break;
        default: return { items: [], totalGroups: 0 };
      }
      // Nếu BE đã collapse rồi thì cần raw query lại để lấy tail
      // Để KISS: query lại với OFFSET = excludeTop
      const offset = Math.max(0, excludeTop);
      const limit = 100;
      const tailSql = this.buildDimensionTailQuery(dim, from, to, offset, limit);
      const rows = await this.prisma.$queryRaw<{ id: bigint | null; name: string | null; revenue: bigint; order_count: bigint }[]>(tailSql);
      const total = baseResp.total;
      const items: TopNItem[] = rows.map(r => ({
        id: r.id?.toString() ?? null,
        name: r.name ?? 'Không rõ',
        revenue: Number(r.revenue),
        orderCount: Number(r.order_count),
        pct: total > 0 ? Math.round((Number(r.revenue) / total) * 1000) / 10 : 0,
      }));
      return { items, totalGroups: baseResp.totalGroups };
    });
  }

  /** Build SQL cho drill-down. Tách riêng để dễ test. */
  private buildDimensionTailQuery(
    dim: 'payment-type' | 'order-format' | 'product-group' | 'bank-account' | 'installment' | 'tier',
    from: Date, to: Date, offset: number, limit: number,
  ): Prisma.Sql {
    switch (dim) {
      // Doanh thu TONG (VERIFIED+REJECTED) cho tat ca dimension drill-down.
      case 'payment-type':
        return Prisma.sql`
          SELECT pt.id, pt.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(*)::bigint AS order_count
          FROM payments p JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          LEFT JOIN payment_types pt ON pt.id = p.payment_type_id
          WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          GROUP BY pt.id, pt.name ORDER BY revenue DESC, pt.name ASC NULLS LAST
          OFFSET ${offset} LIMIT ${limit}`;
      case 'order-format':
        return Prisma.sql`
          SELECT of.id, of.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(DISTINCT o.id)::bigint AS order_count
          FROM payments p JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          LEFT JOIN order_formats of ON of.id = o.format_id
          WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          GROUP BY of.id, of.name ORDER BY revenue DESC, of.name ASC NULLS LAST
          OFFSET ${offset} LIMIT ${limit}`;
      case 'product-group':
        return Prisma.sql`
          SELECT pg.id, pg.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(DISTINCT o.id)::bigint AS order_count
          FROM payments p JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          LEFT JOIN product_groups pg ON pg.id = o.product_group_id
          WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          GROUP BY pg.id, pg.name ORDER BY revenue DESC, pg.name ASC NULLS LAST
          OFFSET ${offset} LIMIT ${limit}`;
      case 'bank-account':
        return Prisma.sql`
          SELECT ba.id, COALESCE(ba.name, 'Không qua bank') AS name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(*)::bigint AS order_count
          FROM payments p JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id
          WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          GROUP BY ba.id, ba.name ORDER BY revenue DESC, ba.name ASC NULLS LAST
          OFFSET ${offset} LIMIT ${limit}`;
      case 'installment':
        return Prisma.sql`
          SELECT pi.id, pi.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(*)::bigint AS order_count
          FROM payments p JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          LEFT JOIN payment_installments pi ON pi.id = p.installment_id
          WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          GROUP BY pi.id, pi.name ORDER BY revenue DESC, pi.name ASC NULLS LAST
          OFFSET ${offset} LIMIT ${limit}`;
      case 'tier':
        return Prisma.sql`
          SELECT ct.id, ct.name, COALESCE(SUM(p.amount), 0)::bigint AS revenue, COUNT(DISTINCT c.id)::bigint AS order_count
          FROM payments p JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
          JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
          LEFT JOIN customer_tiers ct ON ct.id = c.current_tier_id
          WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
          GROUP BY ct.id, ct.name, ct.sort_order ORDER BY revenue DESC, ct.sort_order ASC NULLS LAST
          OFFSET ${offset} LIMIT ${limit}`;
    }
  }

  // ── Daily revenue by product group (Stacked bar for H1) ───────────────────

  /**
   * Doanh thu theo NGÀY × NHÓM SP (gap-filled).
   * Quy tắc:
   *   - Date theo VN tz (Asia/Ho_Chi_Minh) - đồng bộ với getRevenueTrend.
   *   - Top 5 group theo total revenue + gom phần còn lại thành "Khác".
   *   - Mỗi ngày trong [from, to] xuất hiện đầy đủ qua generate_series (0 nếu không có doanh thu).
   */
  async getRevenueDailyByGroup(from: Date, to: Date): Promise<DailyByGroupResponse> {
    const key = this.cacheKey('rev-daily-by-group', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Doanh thu TONG (VERIFIED+REJECTED) - stacked bar toan cong ty theo nhom SP.
      const rows = await this.prisma.$queryRaw<{ day: Date; group_id: bigint | null; group_name: string | null; revenue: bigint }[]>`
        SELECT d.day::date AS day, pg.id AS group_id, pg.name AS group_name, COALESCE(SUM(p.amount), 0)::bigint AS revenue
        FROM generate_series(${from}::date, ${to}::date, '1 day'::interval) d(day)
        LEFT JOIN payments p ON (p.status = 'VERIFIED' OR p.status = 'REJECTED')
          AND ((p.verified_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day
          -- Guard tai join payments: dam bao chi tinh payment cua don chua xoa.
          AND EXISTS (
            SELECT 1 FROM orders ov
            WHERE ov.id = p.order_id AND ov.deleted_at IS NULL
          )
        LEFT JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN product_groups pg ON pg.id = o.product_group_id
        GROUP BY d.day, pg.id, pg.name
        ORDER BY d.day ASC, revenue DESC
      `;

      // Build days[] và collect tổng per-group để chọn top-5 + Khác
      const dayKeys = new Set<string>();
      const groupTotals = new Map<string, number>();
      const cellMap = new Map<string, Map<string, number>>(); // day -> (group -> revenue)

      for (const r of rows) {
        const dayStr = r.day.toISOString().slice(0, 10);
        dayKeys.add(dayStr);
        const groupName = r.group_name ?? 'Không rõ';
        const rev = Number(r.revenue);
        if (rev === 0 && r.group_id === null) continue; // skip empty filler
        groupTotals.set(groupName, (groupTotals.get(groupName) ?? 0) + rev);
        if (!cellMap.has(dayStr)) cellMap.set(dayStr, new Map());
        const dayCell = cellMap.get(dayStr)!;
        dayCell.set(groupName, (dayCell.get(groupName) ?? 0) + rev);
      }

      const days = [...dayKeys].sort();
      const sortedGroups = [...groupTotals.entries()].sort((a, b) => b[1] - a[1]);
      const topN = 5;
      const topGroupNames = sortedGroups.slice(0, topN).map(([n]) => n);
      const otherGroupNames = new Set(sortedGroups.slice(topN).map(([n]) => n));

      // Color palette: Online=sky, Tool=amber, fallback theo index
      const palette = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#f43f5e', '#94a3b8'];
      const colorFor = (name: string, idx: number) => {
        if (name === 'Online') return '#0ea5e9';
        if (name === 'Tool') return '#f59e0b';
        return palette[idx % palette.length];
      };

      const groups: DailyByGroupSeries[] = topGroupNames.map((name, idx) => ({
        name,
        color: colorFor(name, idx),
        daily: days.map(d => cellMap.get(d)?.get(name) ?? 0),
      }));

      // Gom "Khác" nếu có group ngoài top-N
      if (otherGroupNames.size > 0) {
        groups.push({
          name: 'Khác',
          color: '#94a3b8',
          daily: days.map(d => {
            const dayCell = cellMap.get(d);
            if (!dayCell) return 0;
            let sum = 0;
            for (const [gName, val] of dayCell) {
              if (otherGroupNames.has(gName)) sum += val;
            }
            return sum;
          }),
        });
      }

      const total = groups.reduce<number>((s, g) => s + g.daily.reduce<number>((a, b) => a + b, 0), 0);
      return { days, groups, total };
    });
  }

  // ── Sankey: source → format → tier ────────────────────────────────────────

  /**
   * Sankey 3 cột: Nguồn lead → Hình thức đơn → Tier KH.
   * Link sạch qua orders.lead_id (Schema L550).
   * Top-N: 4 source + "Khác", giữ all format + all tier (số lượng nhỏ < 10 mỗi loại).
   */
  async getRevenueSankey(from: Date, to: Date): Promise<SankeyRevenueResponse> {
    const key = this.cacheKey('rev-sankey', from, to);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Doanh thu TONG (VERIFIED+REJECTED) - Sankey toan cong ty: Nguon -> Format -> Tier.
      const rows = await this.prisma.$queryRaw<{
        source_name: string; format_name: string; tier_name: string; revenue: bigint;
      }[]>`
        SELECT
          COALESCE(ls.name, 'Không rõ nguồn') AS source_name,
          COALESCE(of.name, 'Không rõ format') AS format_name,
          COALESCE(ct.name, 'Chưa phân hạng') AS tier_name,
          COALESCE(SUM(p.amount), 0)::bigint AS revenue
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
        LEFT JOIN leads l ON l.id = o.lead_id
        LEFT JOIN lead_sources ls ON ls.id = l.source_id
        LEFT JOIN order_formats of ON of.id = o.format_id
        LEFT JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
        LEFT JOIN customer_tiers ct ON ct.id = c.current_tier_id
        WHERE ${SQL_REVENUE_TOTAL} AND p.verified_at >= ${from} AND p.verified_at <= ${to}
        GROUP BY ls.name, of.name, ct.name
        HAVING COALESCE(SUM(p.amount), 0) > 0
        ORDER BY revenue DESC
      `;

      // Tổng revenue per source/format/tier
      const sourceTotals = new Map<string, number>();
      const formatTotals = new Map<string, number>();
      const tierTotals = new Map<string, number>();
      for (const r of rows) {
        const v = Number(r.revenue);
        sourceTotals.set(r.source_name, (sourceTotals.get(r.source_name) ?? 0) + v);
        formatTotals.set(r.format_name, (formatTotals.get(r.format_name) ?? 0) + v);
        tierTotals.set(r.tier_name, (tierTotals.get(r.tier_name) ?? 0) + v);
      }
      const total = [...sourceTotals.values()].reduce((a, b) => a + b, 0);

      // Top-N source: 4 + "Khác"
      const sortedSources = [...sourceTotals.entries()].sort((a, b) => b[1] - a[1]);
      const TOP_SOURCE_N = 4;
      const topSources = new Set(sortedSources.slice(0, TOP_SOURCE_N).map(([n]) => n));
      const otherSourceCount = sortedSources.length - TOP_SOURCE_N;
      const otherSourceLabel = otherSourceCount > 0 ? `${otherSourceCount} nguồn khác` : null;

      const normalizeSource = (s: string): string =>
        topSources.has(s) ? s : (otherSourceLabel ?? s);

      // Build node list
      const sourceNames = [...topSources, ...(otherSourceLabel ? [otherSourceLabel] : [])];
      const formatNames = [...formatTotals.keys()].sort((a, b) => (formatTotals.get(b) ?? 0) - (formatTotals.get(a) ?? 0));
      const tierNames = [...tierTotals.keys()].sort((a, b) => (tierTotals.get(b) ?? 0) - (tierTotals.get(a) ?? 0));

      const nodes: SankeyNode[] = [
        ...sourceNames.map<SankeyNode>(name => ({
          name, level: 'source',
          value: topSources.has(name)
            ? (sourceTotals.get(name) ?? 0)
            : sortedSources.slice(TOP_SOURCE_N).reduce((s, [, v]) => s + v, 0),
        })),
        ...formatNames.map<SankeyNode>(name => ({ name, level: 'format', value: formatTotals.get(name) ?? 0 })),
        ...tierNames.map<SankeyNode>(name => ({ name, level: 'tier', value: tierTotals.get(name) ?? 0 })),
      ];

      const idxOf = (name: string, level: 'source' | 'format' | 'tier'): number =>
        nodes.findIndex(n => n.name === name && n.level === level);

      // Aggregate flows: source→format và format→tier
      const flowSF = new Map<string, number>(); // "src|fmt" -> rev
      const flowFT = new Map<string, number>(); // "fmt|tier" -> rev
      for (const r of rows) {
        const v = Number(r.revenue);
        const src = normalizeSource(r.source_name);
        const sfKey = `${src}|${r.format_name}`;
        const ftKey = `${r.format_name}|${r.tier_name}`;
        flowSF.set(sfKey, (flowSF.get(sfKey) ?? 0) + v);
        flowFT.set(ftKey, (flowFT.get(ftKey) ?? 0) + v);
      }

      const links: SankeyLink[] = [];
      for (const [key, value] of flowSF) {
        const [src, fmt] = key.split('|');
        const s = idxOf(src, 'source');
        const t = idxOf(fmt, 'format');
        if (s >= 0 && t >= 0) links.push({ source: s, target: t, value });
      }
      for (const [key, value] of flowFT) {
        const [fmt, tier] = key.split('|');
        const s = idxOf(fmt, 'format');
        const t = idxOf(tier, 'tier');
        if (s >= 0 && t >= 0) links.push({ source: s, target: t, value });
      }

      // Insight: tier dominant + source dominant
      const topSourceEntry = sortedSources[0];
      const topTierEntry = tierNames[0] ? [tierNames[0], tierTotals.get(tierNames[0]) ?? 0] as const : null;
      const insight = total > 0 && topSourceEntry && topTierEntry
        ? {
          topSourceName: topSourceEntry[0],
          topSourcePct: Math.round((topSourceEntry[1] / total) * 1000) / 10,
          topTierName: topTierEntry[0],
          topTierPct: Math.round((topTierEntry[1] / total) * 1000) / 10,
        }
        : null;

      return { nodes, links, total, insight };
    });
  }
}
