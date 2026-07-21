import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';
import { SQL_REVENUE_TOTAL, SQL_REVENUE_SALE } from '../../../common/constants/revenue-filter';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const revenueSchema = z.object({
  dateFrom: z.string().describe('Period start (ISO date, required)'),
  dateTo: z.string().describe('Period end (ISO date, required)'),
  departmentId: z.string().optional().describe('Filter by department ID (via lead.departmentId of the order)'),
});

type RevenueParams = z.infer<typeof revenueSchema>;

/**
 * Register get_revenue_breakdown - splits revenue in a period across 3 axes:
 * verify-status, source, and sale (order creator).
 *
 * Revenue date axis = payment.createdAt (single shared axis for all 5 statuses,
 * so PENDING is never dropped). Order filter: only not soft-deleted.
 * byVerifyStatus groups all 5 payment statuses: VERIFIED, REJECTED, PENDING, REFUNDED, CANCELLED.
 * total = VERIFIED+REJECTED (doanh thu TONG cong ty).
 * bySource = TONG (attribution cong ty theo nguon lead).
 * bySale = SALE VERIFIED only (KPI ca nhan theo NV tao don).
 * One order with N payments = N rows of money (no dedup by order - by design).
 */
export function registerRevenueTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'get_revenue_breakdown',
    {
      title: 'Get Revenue Breakdown',
      description:
        'Breaks revenue in a date range into: total (VERIFIED+REJECTED = doanh thu TONG cong ty), ' +
        'byVerifyStatus {verified, pending, rejected, refunded, cancelled} (SUM amount per ' +
        'payment.status, all 5 statuses), bySource[] (TONG VERIFIED+REJECTED, grouped by lead source), and ' +
        'bySale[] (SALE VERIFIED only, grouped by order creator = KPI ca nhan). Date axis = ' +
        'payment.createdAt (NOTE: analyze_lead_quality / analyze_ads_effectiveness ' +
        'use payment.verifiedAt instead, so totals there may differ for ' +
        'the same range). Excludes soft-deleted orders only. ' +
        'Each payment is a separate money row (no dedup per order).',
      inputSchema: revenueSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: RevenueParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }

      try {
        const from = new Date(params.dateFrom);
        const to = new Date(params.dateTo + 'T23:59:59Z');
        const deptId = params.departmentId ? BigInt(params.departmentId) : null;

        // Department filter applies to the order's lead.departmentId.
        const deptOrderFilter = deptId
          ? { lead: { is: { departmentId: deptId } } }
          : {};
        const deptSqlFilter = deptId
          ? Prisma.sql`AND l.department_id = ${deptId}`
          : Prisma.sql``;

        // ── byVerifyStatus: phan tach ca 5 payment status moi + total = TONG ──
        const statusGroups = await prisma.payment.groupBy({
          by: ['status'],
          _sum: { amount: true },
          where: {
            createdAt: { gte: from, lte: to },
            order: {
              deletedAt: null,
              ...deptOrderFilter,
            },
          },
        });

        const byVerifyStatus = { verified: 0, pending: 0, rejected: 0, refunded: 0, cancelled: 0 };
        for (const g of statusGroups) {
          const amount = Number(g._sum.amount ?? 0);
          if (g.status === 'VERIFIED') byVerifyStatus.verified = amount;
          else if (g.status === 'PENDING') byVerifyStatus.pending = amount;
          else if (g.status === 'REJECTED') byVerifyStatus.rejected = amount;
          else if (g.status === 'REFUNDED') byVerifyStatus.refunded = amount;
          else if (g.status === 'CANCELLED') byVerifyStatus.cancelled = amount;
        }
        // Doanh thu TONG = VERIFIED + REJECTED (tien thuc su ve cong ty).
        const total = byVerifyStatus.verified + byVerifyStatus.rejected;

        // ── bySource: TONG (VERIFIED+REJECTED) - attribution cong ty theo nguon lead ──
        const sourceRows = await prisma.$queryRaw<{
          source_id: bigint | null; source_name: string; revenue: bigint; cnt: bigint;
        }[]>`
          SELECT ls.id AS source_id,
                 COALESCE(ls.name, 'Không rõ') AS source_name,
                 SUM(p.amount)::bigint AS revenue,
                 COUNT(p.id)::bigint AS cnt
          FROM payments p
          JOIN orders o ON o.id = p.order_id
          LEFT JOIN leads l ON l.id = o.lead_id
          LEFT JOIN lead_sources ls ON ls.id = l.source_id
          WHERE ${SQL_REVENUE_TOTAL}
            AND o.deleted_at IS NULL
            AND p.created_at >= ${from} AND p.created_at <= ${to}
            ${deptSqlFilter}
          GROUP BY ls.id, ls.name
          ORDER BY revenue DESC
        `;
        const bySource = sourceRows.map((r) => ({
          sourceId: r.source_id !== null ? r.source_id.toString() : null,
          sourceName: r.source_name,
          revenue: Number(r.revenue),
          paymentCount: Number(r.cnt),
        }));

        // ── bySale: SALE (VERIFIED only) - KPI ca nhan, group by order creator (NV) ──
        const saleRows = await prisma.$queryRaw<{
          user_id: bigint; user_name: string; revenue: bigint; cnt: bigint;
        }[]>`
          SELECT o.created_by AS user_id,
                 COALESCE(u.name, 'Không rõ') AS user_name,
                 SUM(p.amount)::bigint AS revenue,
                 COUNT(p.id)::bigint AS cnt
          FROM payments p
          JOIN orders o ON o.id = p.order_id
          LEFT JOIN leads l ON l.id = o.lead_id
          LEFT JOIN users u ON u.id = o.created_by
          WHERE ${SQL_REVENUE_SALE}
            AND o.deleted_at IS NULL
            AND p.created_at >= ${from} AND p.created_at <= ${to}
            ${deptSqlFilter}
          GROUP BY o.created_by, u.name
          ORDER BY revenue DESC
        `;
        const bySale = saleRows.map((r) => ({
          userId: r.user_id.toString(),
          userName: r.user_name,
          revenue: Number(r.revenue),
          paymentCount: Number(r.cnt),
        }));

        const result = {
          period: { from: from.toISOString(), to: to.toISOString() },
          total,
          byVerifyStatus,
          bySource,
          bySale,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
