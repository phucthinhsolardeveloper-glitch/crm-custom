import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

/** JSON replacer that converts BigInt to string */
function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const LEAD_SUMMARY_SELECT = {
  id: true, phone: true, name: true, email: true, status: true,
  companyName: true, createdAt: true, updatedAt: true,
  customer: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  source: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true, textColor: true } } } },
};

const LEAD_DETAIL_SELECT = {
  ...LEAD_SUMMARY_SELECT,
  facebookUrl: true, instagramUrl: true, zaloUrl: true, linkedinUrl: true,
  metadata: true, customerId: true, productId: true, sourceId: true,
  assignedUserId: true, departmentId: true,
  orders: {
    where: { deletedAt: null },
    select: {
      id: true, status: true, totalAmount: true, createdAt: true,
      product: { select: { name: true } },
      payments: {
        select: { id: true, amount: true, status: true, createdAt: true },
      },
    },
    orderBy: { id: 'desc' as const },
    take: 10,
  },
};

const searchLeadsSchema = z.object({
  search: z.string().optional().describe('Search by name, phone, or email'),
  status: z.enum(['POOL', 'ZOOM', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING']).optional(),
  departmentId: z.string().optional().describe('Filter by department ID'),
  userId: z.string().optional().describe('Filter by assigned user ID'),
  sourceId: z.string().optional().describe('Filter by lead source ID'),
  labelId: z.string().optional().describe('Filter by label ID'),
  dateFrom: z.string().optional().describe('Created after (ISO date, e.g. 2026-01-01)'),
  dateTo: z.string().optional().describe('Created before (ISO date)'),
  limit: z.number().int().min(1).max(100).default(20).describe('Results per page'),
  cursor: z.string().optional().describe('Cursor for next page (last lead ID)'),
});

type SearchLeadsParams = z.infer<typeof searchLeadsSchema>;

export function registerLeadsTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'search_leads',
    {
      title: 'Search Leads',
      description:
        'Search CRM leads with filters. Returns summary list with pagination. ' +
        'Always use filters to narrow results - never fetch all.',
      inputSchema: searchLeadsSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: SearchLeadsParams) => {
      if (!hasPermission(permissions, 'mcp:leads:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:leads:read required' }], isError: true };
      }

      try {
        const where: Record<string, unknown> = { deletedAt: null };
        if (params.status) where.status = params.status;
        if (params.departmentId) where.departmentId = BigInt(params.departmentId);
        if (params.userId) where.assignedUserId = BigInt(params.userId);
        if (params.sourceId) where.sourceId = BigInt(params.sourceId);
        if (params.labelId) where.labels = { some: { labelId: BigInt(params.labelId) } };
        if (params.dateFrom || params.dateTo) {
          where.createdAt = {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo + 'T23:59:59Z') } : {}),
          };
        }
        if (params.search) {
          where.OR = [
            { name: { contains: params.search, mode: 'insensitive' } },
            { phone: { contains: params.search } },
            { email: { contains: params.search, mode: 'insensitive' } },
          ];
        }

        const limit = params.limit;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const findArgs: any = {
          where, select: LEAD_SUMMARY_SELECT, orderBy: { id: 'desc' }, take: limit + 1,
        };
        if (params.cursor) {
          findArgs.skip = 1;
          findArgs.cursor = { id: BigInt(params.cursor) };
        }

        const [leads, total] = await Promise.all([
          prisma.lead.findMany(findArgs),
          prisma.lead.count({ where: where as any }),
        ]);

        const hasMore = leads.length > limit;
        const data = hasMore ? leads.slice(0, limit) : leads;
        const nextCursor = hasMore && data.length > 0 ? String((data[data.length - 1] as any).id) : undefined;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ data, total, hasMore, nextCursor }, bigIntReplacer, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  server.registerTool(
    'get_lead_detail',
    {
      title: 'Get Lead Detail',
      description:
        'Get full lead detail by ID. Includes orders, payments, labels, ' +
        'and last 10 activities/notes.',
      inputSchema: z.object({
        id: z.string().describe('Lead ID'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { id: string }) => {
      if (!hasPermission(permissions, 'mcp:leads:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:leads:read required' }], isError: true };
      }

      try {
        const lead = await prisma.lead.findFirst({
          where: { id: BigInt(params.id), deletedAt: null },
          select: LEAD_DETAIL_SELECT as any,
        });
        if (!lead) {
          return { content: [{ type: 'text' as const, text: 'Lead not found' }], isError: true };
        }

        const activities = await prisma.activity.findMany({
          where: { entityType: 'LEAD', entityId: BigInt(params.id) },
          select: { id: true, type: true, content: true, createdAt: true, user: { select: { name: true } } },
          orderBy: { id: 'desc' },
          take: 10,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ lead, recentActivities: activities }, bigIntReplacer, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
