import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';
import { REVENUE_TOTAL_STATUSES } from '../../../common/constants/revenue-filter';

const getStatsSchema = z.object({
  dateFrom: z.string().optional().describe('Period start (ISO date, default: first of current month)'),
  dateTo: z.string().optional().describe('Period end (ISO date, default: today)'),
  departmentId: z.string().optional().describe('Scope stats to a specific department'),
});

type GetStatsParams = z.infer<typeof getStatsSchema>;

export function registerStatsTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'get_stats',
    {
      title: 'Get Dashboard Stats',
      description:
        'Get CRM dashboard KPIs: new leads, in-progress, converted, revenue, ' +
        'customers, orders, pending payments, overdue tasks. Supports date range.',
      inputSchema: getStatsSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: GetStatsParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }

      try {
        const now = new Date();
        const from = params.dateFrom ? new Date(params.dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
        const to = params.dateTo ? new Date(params.dateTo + 'T23:59:59Z') : now;
        const dateRange = { gte: from, lte: to };

        const deptFilter: Record<string, unknown> = params.departmentId
          ? { departmentId: BigInt(params.departmentId) } : {};

        const [newLeads, inProgress, converted, revenueAgg, newCustomers, totalOrders, pendingPayments, overdueTasks] = await Promise.all([
          prisma.lead.count({ where: { deletedAt: null, ...deptFilter, status: 'POOL', createdAt: dateRange } as any }),
          prisma.lead.count({ where: { deletedAt: null, ...deptFilter, status: 'IN_PROGRESS' } as any }),
          prisma.lead.count({ where: { deletedAt: null, ...deptFilter, status: 'CONVERTED', updatedAt: dateRange } as any }),
          // Doanh thu TONG (VERIFIED+REJECTED) - MCP stats la admin-only, dung vi cong ty.
          prisma.payment.aggregate({
            _sum: { amount: true },
            where: {
              status: { in: REVENUE_TOTAL_STATUSES },
              verifiedAt: dateRange,
              order: { deletedAt: null },
            },
          }),
          prisma.customer.count({ where: { deletedAt: null, createdAt: dateRange } }),
          prisma.order.count({ where: { deletedAt: null, createdAt: dateRange } }),
          prisma.payment.count({ where: { status: 'PENDING' } }),
          prisma.task.count({ where: { deletedAt: null, status: 'PENDING', dueDate: { lt: now } } }),
        ]);

        // Lead funnel breakdown
        const statuses = ['POOL', 'ZOOM', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING'] as const;
        const funnelCounts = await Promise.all(
          statuses.map((status) => prisma.lead.count({ where: { deletedAt: null, ...deptFilter, status } as any })),
        );
        const funnel = statuses.map((status, i) => ({ status, count: funnelCounts[i] }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              period: { from: from.toISOString(), to: to.toISOString() },
              kpis: {
                newLeads, inProgress, converted,
                revenue: Number(revenueAgg._sum.amount ?? 0),
                newCustomers, totalOrders, pendingPayments, overdueTasks,
              },
              leadFunnel: funnel,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
