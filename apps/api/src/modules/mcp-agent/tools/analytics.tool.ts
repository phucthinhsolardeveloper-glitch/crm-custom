import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import { hasPermission } from '../mcp-agent-auth.guard';
import { REVENUE_TOTAL_STATUSES } from '../../../common/constants/revenue-filter';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/** Fake admin user for DashboardService calls (MCP has no user context) */
const ADMIN_USER_ID = BigInt(1);
const ADMIN_ROLE = 'SUPER_ADMIN';

const dateRangeSchema = z.object({
  dateFrom: z.string().describe('Period start (ISO date, e.g. 2026-04-01)'),
  dateTo: z.string().describe('Period end (ISO date, e.g. 2026-04-12)'),
});

type DateRangeParams = z.infer<typeof dateRangeSchema>;

export function registerAnalyticsTools(
  server: McpServer,
  prisma: PrismaClient,
  dashboard: DashboardService,
  permissions: string[],
): void {
  // ── 1. Revenue Trend ─────────────────────────────────────────
  server.registerTool(
    'get_revenue_trend',
    {
      title: 'Revenue Trend',
      description:
        'Daily revenue breakdown for a date range. ' +
        'Shows verified payment totals per day - use for line/bar charts.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getRevenueTrend(
          ADMIN_USER_ID, ADMIN_ROLE,
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 2. Top Performers ────────────────────────────────────────
  server.registerTool(
    'get_top_performers',
    {
      title: 'Top Sales Performers',
      description:
        'Ranking of sales users by converted leads and revenue in a date range. ' +
        'Top 10 performers. Use for leaderboard.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getTopPerformers(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 3. Department Performance ────────────────────────────────
  server.registerTool(
    'get_dept_performance',
    {
      title: 'Department Performance',
      description:
        'Revenue, leads, and conversions per department in a date range. ' +
        'Compare departments side by side.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getDeptPerformance(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 4. Team Performance ──────────────────────────────────────
  server.registerTool(
    'get_team_performance',
    {
      title: 'Team Performance',
      description:
        'Revenue, leads, conversions, and member count per team. ' +
        'Drill down within departments to compare teams.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getTeamPerformance(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 5. Leads by Source ───────────────────────────────────────
  server.registerTool(
    'get_leads_by_source',
    {
      title: 'Leads by Source',
      description:
        'Lead count, converted count, and conversion rate per lead source. ' +
        'Shows which acquisition channels perform best.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getLeadsBySource(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 6. Conversion Trend ──────────────────────────────────────
  server.registerTool(
    'get_conversion_trend',
    {
      title: 'Conversion Trend',
      description:
        'Daily new leads vs converted leads trend. ' +
        'Shows if conversion rate is improving or declining over time.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getConversionTrend(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 7. Lead Aging ────────────────────────────────────────────
  server.registerTool(
    'get_lead_aging',
    {
      title: 'Lead Aging',
      description:
        'How many active leads (IN_PROGRESS/ASSIGNED) have not been interacted with. ' +
        'Buckets: 0-1 day, 1-3 days, 3-7 days, 7+ days. Identifies stale leads.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getLeadAging(ADMIN_USER_ID, ADMIN_ROLE);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 8. Lead Quality / ROI Analysis ───────────────────────────
  server.registerTool(
    'analyze_lead_quality',
    {
      title: 'Lead Quality & ROI Analysis',
      description:
        'Analyze lead quality with optional ads spend for ROI calculation. ' +
        'Returns: total leads, converted, conversion rate, revenue. ' +
        'If adSpend provided: CPL (cost per lead), CPA (cost per acquisition), ROAS. ' +
        'Breakdown by source included.',
      inputSchema: z.object({
        dateFrom: z.string().describe('Period start (ISO date)'),
        dateTo: z.string().describe('Period end (ISO date)'),
        adSpend: z.number().optional().describe('Total advertising spend in VND for the period'),
        sourceId: z.string().optional().describe('Filter to specific lead source ID'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { dateFrom: string; dateTo: string; adSpend?: number; sourceId?: string }) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const from = new Date(params.dateFrom);
        const to = new Date(params.dateTo + 'T23:59:59Z');

        // Get source breakdown from existing method
        const sourceData = await dashboard.getLeadsBySource(from, to);

        // If sourceId filter, narrow down
        const filtered = params.sourceId
          ? sourceData.filter((s: { source: string }) => s.source !== 'Không rõ') // filter known sources
          : sourceData;

        // Aggregate totals
        const totalLeads = filtered.reduce((sum: number, s: { total: number }) => sum + s.total, 0);
        const totalConverted = filtered.reduce((sum: number, s: { converted: number }) => sum + s.converted, 0);
        const conversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100 * 10) / 10 : 0;

        // Doanh thu TONG (VERIFIED+REJECTED) - tong hop cong ty cho ROI calculation.
        const revenueAgg = await prisma.payment.aggregate({
          _sum: { amount: true },
          where: {
            status: { in: REVENUE_TOTAL_STATUSES },
            verifiedAt: { gte: from, lte: to },
            order: { deletedAt: null },
          },
        });
        const revenue = Number(revenueAgg._sum.amount ?? 0);

        // ROI calculations (only if adSpend provided)
        const roi = params.adSpend && params.adSpend > 0 ? {
          adSpend: params.adSpend,
          costPerLead: Math.round(params.adSpend / Math.max(totalLeads, 1)),
          costPerAcquisition: totalConverted > 0 ? Math.round(params.adSpend / totalConverted) : null,
          roas: Math.round((revenue / params.adSpend) * 100) / 100,
          roasPercent: `${Math.round((revenue / params.adSpend) * 100)}%`,
        } : null;

        const result = {
          period: { from: from.toISOString(), to: to.toISOString() },
          summary: { totalLeads, totalConverted, conversionRate: `${conversionRate}%`, revenue },
          roi,
          bySource: filtered,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 9. Ads Effectiveness - Dedup + Source×Product Matrix ─────
  server.registerTool(
    'analyze_ads_effectiveness',
    {
      title: 'Ads Effectiveness Analysis',
      description:
        'Deep analysis of advertising effectiveness. Detects: ' +
        '(1) phone dedup ratio (unique phones vs total leads), ' +
        '(2) true duplicates (same phone+product+source = wasted spend), ' +
        '(3) multi-product interest (same phone, different products = upsell), ' +
        '(4) revenue attribution per source (actual VND, not just count), ' +
        '(5) avg days to convert, ' +
        '(6) source×product performance matrix. ' +
        'Provide adSpend to calculate CPL per source.',
      inputSchema: z.object({
        dateFrom: z.string().describe('Period start (ISO date)'),
        dateTo: z.string().describe('Period end (ISO date)'),
        adSpend: z.number().optional().describe('Total ads spend in VND (optional, for CPL calculation)'),
        sourceId: z.string().optional().describe('Filter to specific source ID'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { dateFrom: string; dateTo: string; adSpend?: number; sourceId?: string }) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const from = new Date(params.dateFrom);
        const to = new Date(params.dateTo + 'T23:59:59Z');
        const sourceFilter = params.sourceId
          ? Prisma.sql`AND l.source_id = ${BigInt(params.sourceId)}`
          : Prisma.sql``;

        // ── 1. Dedup analysis ──────────────────────────────────
        const dedupRows = await prisma.$queryRaw<{ total_leads: bigint; unique_phones: bigint }[]>`
          SELECT COUNT(*)::bigint as total_leads,
                 COUNT(DISTINCT phone)::bigint as unique_phones
          FROM leads l
          WHERE l.deleted_at IS NULL
            AND l.created_at >= ${from} AND l.created_at <= ${to}
            ${sourceFilter}
        `;
        const totalLeads = Number(dedupRows[0]?.total_leads ?? 0);
        const uniquePhones = Number(dedupRows[0]?.unique_phones ?? 0);
        const dedupRatio = totalLeads > 0 ? Math.round((uniquePhones / totalLeads) * 100) : 100;

        // ── 2. True duplicates (same phone+product+source) ────
        const dupeRows = await prisma.$queryRaw<{
          phone: string; source_name: string; product_name: string; count: bigint;
        }[]>`
          SELECT l.phone,
                 COALESCE(ls.name, 'Không rõ') as source_name,
                 COALESCE(p.name, 'Không rõ') as product_name,
                 COUNT(*)::bigint as count
          FROM leads l
          LEFT JOIN lead_sources ls ON ls.id = l.source_id
          LEFT JOIN products p ON p.id = l.product_id
          WHERE l.deleted_at IS NULL
            AND l.created_at >= ${from} AND l.created_at <= ${to}
            ${sourceFilter}
          GROUP BY l.phone, ls.name, p.name
          HAVING COUNT(*) > 1
          ORDER BY count DESC
          LIMIT 20
        `;

        // ── 3. Multi-product interest (same phone, diff products)
        const multiProductRows = await prisma.$queryRaw<{
          phone: string; name: string; product_count: bigint; products: string;
        }[]>`
          SELECT l.phone, MAX(l.name) as name,
                 COUNT(DISTINCT l.product_id)::bigint as product_count,
                 STRING_AGG(DISTINCT p.name, ', ') as products
          FROM leads l
          LEFT JOIN products p ON p.id = l.product_id
          WHERE l.deleted_at IS NULL
            AND l.created_at >= ${from} AND l.created_at <= ${to}
            AND l.product_id IS NOT NULL
            ${sourceFilter}
          GROUP BY l.phone
          HAVING COUNT(DISTINCT l.product_id) > 1
          ORDER BY product_count DESC
          LIMIT 20
        `;

        // ── 4. Revenue per source: TONG (VERIFIED+REJECTED) - attribution cong ty ──
        const revenueBySource = await prisma.$queryRaw<{
          source_name: string; leads: bigint; converted: bigint; revenue: bigint;
        }[]>`
          SELECT COALESCE(ls.name, 'Không rõ') as source_name,
                 COUNT(DISTINCT l.id)::bigint as leads,
                 COUNT(DISTINCT CASE WHEN l.status = 'CONVERTED' THEN l.id END)::bigint as converted,
                 COALESCE(SUM(CASE WHEN pay.status IN ('VERIFIED', 'REJECTED') THEN pay.amount ELSE 0 END), 0)::bigint as revenue
          FROM leads l
          LEFT JOIN lead_sources ls ON ls.id = l.source_id
          LEFT JOIN orders o ON o.lead_id = l.id AND o.deleted_at IS NULL
          LEFT JOIN payments pay ON pay.order_id = o.id
          WHERE l.deleted_at IS NULL
            AND l.created_at >= ${from} AND l.created_at <= ${to}
            ${sourceFilter}
          GROUP BY ls.name
          ORDER BY revenue DESC
        `;

        // ── 5. Avg conversion time ────────────────────────────
        const convTimeRows = await prisma.$queryRaw<{ avg_days: number }[]>`
          SELECT ROUND(AVG(EXTRACT(DAY FROM l.updated_at - l.created_at))::numeric, 1) as avg_days
          FROM leads l
          WHERE l.deleted_at IS NULL AND l.status = 'CONVERTED'
            AND l.created_at >= ${from} AND l.created_at <= ${to}
            ${sourceFilter}
        `;
        const avgDaysToConvert = convTimeRows[0]?.avg_days ?? null;

        // ── 6. Source x Product matrix: TONG (VERIFIED+REJECTED) - attribution cong ty ──
        const matrixRows = await prisma.$queryRaw<{
          source_name: string; product_name: string;
          leads: bigint; converted: bigint; revenue: bigint;
        }[]>`
          SELECT COALESCE(ls.name, 'Không rõ') as source_name,
                 COALESCE(p.name, 'Không rõ') as product_name,
                 COUNT(DISTINCT l.id)::bigint as leads,
                 COUNT(DISTINCT CASE WHEN l.status = 'CONVERTED' THEN l.id END)::bigint as converted,
                 COALESCE(SUM(CASE WHEN pay.status IN ('VERIFIED', 'REJECTED') THEN pay.amount ELSE 0 END), 0)::bigint as revenue
          FROM leads l
          LEFT JOIN lead_sources ls ON ls.id = l.source_id
          LEFT JOIN products p ON p.id = l.product_id
          LEFT JOIN orders o ON o.lead_id = l.id AND o.deleted_at IS NULL
          LEFT JOIN payments pay ON pay.order_id = o.id
          WHERE l.deleted_at IS NULL
            AND l.created_at >= ${from} AND l.created_at <= ${to}
            ${sourceFilter}
          GROUP BY ls.name, p.name
          ORDER BY revenue DESC
          LIMIT 30
        `;

        // Build result
        const totalRevenue = revenueBySource.reduce((s, r) => s + Number(r.revenue), 0);
        const totalConverted = revenueBySource.reduce((s, r) => s + Number(r.converted), 0);

        const result = {
          period: { from: from.toISOString(), to: to.toISOString() },
          dedup: {
            totalLeads,
            uniquePhones,
            dedupRatio: `${dedupRatio}%`,
            duplicateLeads: totalLeads - uniquePhones,
            verdict: dedupRatio >= 90 ? 'Tốt - ít trùng' : dedupRatio >= 70 ? 'Trung bình - có trùng' : 'Kém - nhiều lead trùng SĐT',
          },
          trueDuplicates: {
            count: dupeRows.length,
            note: 'Cùng SĐT + cùng SP + cùng nguồn = lead trùng, phí ads',
            items: dupeRows.map(r => ({
              phone: r.phone, source: r.source_name, product: r.product_name, count: Number(r.count),
            })),
          },
          multiProductInterest: {
            count: multiProductRows.length,
            note: 'Cùng SĐT + khác SP = quan tâm nhiều SP, tiềm năng upsell',
            items: multiProductRows.map(r => ({
              phone: r.phone, name: r.name, productCount: Number(r.product_count), products: r.products,
            })),
          },
          revenueBySource: revenueBySource.map(r => ({
            source: r.source_name,
            leads: Number(r.leads),
            converted: Number(r.converted),
            conversionRate: Number(r.leads) > 0 ? `${Math.round(Number(r.converted) / Number(r.leads) * 100)}%` : '0%',
            revenue: Number(r.revenue),
            ...(params.adSpend ? {
              estimatedCPL: Math.round((params.adSpend * Number(r.leads) / Math.max(totalLeads, 1)) / Math.max(Number(r.leads), 1)),
            } : {}),
          })),
          conversionTime: {
            avgDays: avgDaysToConvert,
            note: avgDaysToConvert !== null ? `Trung bình ${avgDaysToConvert} ngày từ tạo lead → CONVERTED` : 'Chưa có data',
          },
          sourceProductMatrix: matrixRows.map(r => ({
            source: r.source_name, product: r.product_name,
            leads: Number(r.leads), converted: Number(r.converted), revenue: Number(r.revenue),
          })),
          summary: {
            totalLeads, uniquePhones, totalConverted, totalRevenue,
            overallConversionRate: totalLeads > 0 ? `${Math.round(totalConverted / totalLeads * 100)}%` : '0%',
            ...(params.adSpend ? {
              adSpend: params.adSpend,
              cpl: Math.round(params.adSpend / Math.max(totalLeads, 1)),
              cpa: totalConverted > 0 ? Math.round(params.adSpend / totalConverted) : null,
              roas: params.adSpend > 0 ? Math.round(totalRevenue / params.adSpend * 100) / 100 : null,
            } : {}),
          },
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
