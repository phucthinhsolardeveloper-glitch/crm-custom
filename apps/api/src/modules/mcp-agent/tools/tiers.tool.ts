import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const UPGRADE_LIST_LIMIT = 200;

const distributionSchema = z.object({
  departmentId: z.string().optional().describe('Filter by assigned department ID'),
  userId: z.string().optional().describe('Filter by assigned user ID'),
});

const upgradesSchema = z.object({
  dateFrom: z.string().optional().describe('Period start (ISO date). Default: start of current month'),
  dateTo: z.string().optional().describe('Period end (ISO date). Default: now'),
});

type DistributionParams = z.infer<typeof distributionSchema>;
type UpgradesParams = z.infer<typeof upgradesSchema>;

/**
 * Register customer-tier tools (same domain, one file):
 *  - get_tier_distribution: how many customers sit in each tier (+ totalSpent sum)
 *  - get_tier_upgrades: who changed tier in a period, in which direction
 */
export function registerTierTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  // ── get_tier_distribution ────────────────────────────────────
  server.registerTool(
    'get_tier_distribution',
    {
      title: 'Get Tier Distribution',
      description:
        'Customer count and total spending per tier. Includes a "Chưa xếp hạng" ' +
        '(unranked) bucket for customers with no tier. Counts only non-deleted ' +
        'customers. Optional departmentId/userId filters (assigned dept/user).',
      inputSchema: distributionSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DistributionParams) => {
      if (!hasPermission(permissions, 'mcp:customers:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:customers:read required' }], isError: true };
      }

      try {
        const where: Record<string, unknown> = { deletedAt: null };
        if (params.departmentId) where.assignedDepartmentId = BigInt(params.departmentId);
        if (params.userId) where.assignedUserId = BigInt(params.userId);

        const [groups, tiers] = await Promise.all([
          prisma.customer.groupBy({
            by: ['currentTierId'],
            _count: { _all: true },
            _sum: { totalSpent: true },
            where: where as any,
          }),
          prisma.customerTier.findMany({
            select: { id: true, name: true, sortOrder: true },
          }),
        ]);

        const tierMap = new Map(tiers.map((t) => [t.id.toString(), t]));

        const distribution = groups.map((g) => {
          const tierId = g.currentTierId;
          const tier = tierId !== null ? tierMap.get(tierId.toString()) : undefined;
          return {
            tierId: tierId !== null ? tierId.toString() : null,
            tierName: tier ? tier.name : 'Chưa xếp hạng',
            sortOrder: tier ? tier.sortOrder : -1,
            customerCount: g._count._all,
            totalSpentSum: Number(g._sum.totalSpent ?? 0),
          };
        });
        // Unranked first (sortOrder -1), then by tier sortOrder ascending.
        distribution.sort((a, b) => a.sortOrder - b.sortOrder);

        const totalCustomers = distribution.reduce((sum, d) => sum + d.customerCount, 0);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ distribution, totalCustomers }, bigIntReplacer, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── get_tier_upgrades ────────────────────────────────────────
  server.registerTool(
    'get_tier_upgrades',
    {
      title: 'Get Tier Upgrades',
      description:
        'Tier changes in a period (from TIER_CHANGE activities). Default period = ' +
        'current month. Returns summary[] (count grouped by target tier + ' +
        'direction, computed over the FULL period - safe to total) and list[] ' +
        '(each change with from/to tier name, direction up|down|init, changedAt). ' +
        'list[] is capped at 200 most-recent rows; totalCount is exact.',
      inputSchema: upgradesSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: UpgradesParams) => {
      if (!hasPermission(permissions, 'mcp:customers:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:customers:read required' }], isError: true };
      }

      try {
        const now = new Date();
        const from = params.dateFrom
          ? new Date(params.dateFrom)
          : new Date(now.getFullYear(), now.getMonth(), 1);
        const to = params.dateTo ? new Date(params.dateTo + 'T23:59:59Z') : now;

        const where = {
          type: 'TIER_CHANGE' as const,
          entityType: 'CUSTOMER' as const,
          deletedAt: null,
          createdAt: { gte: from, lte: to },
        };

        const [totalCount, activities, tiers] = await Promise.all([
          prisma.activity.count({ where }),
          prisma.activity.findMany({
            where,
            select: { entityId: true, metadata: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: UPGRADE_LIST_LIMIT,
          }),
          prisma.customerTier.findMany({ select: { id: true, name: true, sortOrder: true } }),
        ]);

        const tierMap = new Map(tiers.map((t) => [t.id.toString(), t]));

        // Batch-load customer names for the activities in the page.
        const customerIds = [...new Set(activities.map((a) => a.entityId))];
        const customers = customerIds.length
          ? await prisma.customer.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true },
            })
          : [];
        const customerMap = new Map(customers.map((c) => [c.id.toString(), c.name]));

        const tierName = (id: string | null) =>
          id && tierMap.has(id) ? tierMap.get(id)!.name : id ? 'Không rõ' : 'Chưa xếp hạng';
        const tierRank = (id: string | null) =>
          id && tierMap.has(id) ? tierMap.get(id)!.sortOrder : -1;

        const list = activities.map((a) => {
          const meta = (a.metadata ?? {}) as Record<string, unknown>;
          const fromTierId = (meta.fromTierId as string | null) ?? null;
          const toTierId = (meta.toTierId as string | null) ?? null;
          const fromRank = tierRank(fromTierId);
          const toRank = tierRank(toTierId);
          let direction: 'up' | 'down' | 'init';
          if (fromTierId === null) direction = 'init';
          else if (toRank > fromRank) direction = 'up';
          else direction = 'down';

          return {
            customerId: a.entityId.toString(),
            customerName: customerMap.get(a.entityId.toString()) ?? 'Không rõ',
            fromTierId,
            fromTier: tierName(fromTierId),
            toTierId,
            toTier: tierName(toTierId),
            direction,
            changedAt: a.createdAt.toISOString(),
          };
        });

        // Summary: count per (toTier, direction) over the FULL period (not the
        // capped page) so totals are accurate even when >200 changes occur.
        const summaryRows = await prisma.$queryRaw<{
          from_tier_id: string | null; to_tier_id: string | null; cnt: bigint;
        }[]>`
          SELECT metadata->>'fromTierId' AS from_tier_id,
                 metadata->>'toTierId' AS to_tier_id,
                 COUNT(*)::bigint AS cnt
          FROM activities
          WHERE type = 'TIER_CHANGE'
            AND entity_type = 'CUSTOMER'
            AND deleted_at IS NULL
            AND created_at >= ${from} AND created_at <= ${to}
          GROUP BY metadata->>'fromTierId', metadata->>'toTierId'
        `;

        const summaryMap = new Map<string, { toTierId: string | null; toTier: string; direction: string; count: number }>();
        for (const row of summaryRows) {
          const fromTierId = row.from_tier_id;
          const toTierId = row.to_tier_id;
          let direction: 'up' | 'down' | 'init';
          if (fromTierId === null) direction = 'init';
          else if (tierRank(toTierId) > tierRank(fromTierId)) direction = 'up';
          else direction = 'down';

          const key = `${toTierId ?? 'null'}|${direction}`;
          const count = Number(row.cnt);
          const existing = summaryMap.get(key);
          if (existing) existing.count += count;
          else summaryMap.set(key, { toTierId, toTier: tierName(toTierId), direction, count });
        }
        const summary = [...summaryMap.values()].sort((a, b) => b.count - a.count);

        const result = {
          period: { from: from.toISOString(), to: to.toISOString() },
          totalCount,
          listCount: list.length,
          summary,
          list,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
