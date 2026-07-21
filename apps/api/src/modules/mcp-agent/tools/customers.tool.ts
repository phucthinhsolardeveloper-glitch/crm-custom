import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const CUSTOMER_SUMMARY_SELECT = {
  id: true, phone: true, name: true, email: true, companyName: true,
  shortDescription: true, aiRating: true, status: true,
  createdAt: true, updatedAt: true,
  assignedUser: { select: { id: true, name: true } },
  assignedDepartment: { select: { id: true, name: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true, textColor: true } } } },
};

const CUSTOMER_DETAIL_SELECT = {
  ...CUSTOMER_SUMMARY_SELECT,
  description: true,
  facebookUrl: true, instagramUrl: true, zaloUrl: true, linkedinUrl: true,
  metadata: true, assignedUserId: true, assignedDepartmentId: true,
};

const searchCustomersSchema = z.object({
  search: z.string().optional().describe('Search by name, phone, or email'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'FLOATING']).optional(),
  departmentId: z.string().optional().describe('Filter by department ID'),
  userId: z.string().optional().describe('Filter by assigned user ID'),
  labelId: z.string().optional().describe('Filter by label ID'),
  dateFrom: z.string().optional().describe('Created after (ISO date)'),
  dateTo: z.string().optional().describe('Created before (ISO date)'),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional().describe('Cursor for next page'),
});

type SearchCustomersParams = z.infer<typeof searchCustomersSchema>;

export function registerCustomersTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'search_customers',
    {
      title: 'Search Customers',
      description:
        'Search CRM customers with filters. Returns summary list with AI rating and labels.',
      inputSchema: searchCustomersSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: SearchCustomersParams) => {
      if (!hasPermission(permissions, 'mcp:customers:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:customers:read required' }], isError: true };
      }

      try {
        const where: Record<string, unknown> = { deletedAt: null };
        if (params.status) where.status = params.status;
        if (params.departmentId) where.assignedDepartmentId = BigInt(params.departmentId);
        if (params.userId) where.assignedUserId = BigInt(params.userId);
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
        const findArgs: any = {
          where, select: CUSTOMER_SUMMARY_SELECT, orderBy: { id: 'desc' }, take: limit + 1,
        };
        if (params.cursor) {
          findArgs.skip = 1;
          findArgs.cursor = { id: BigInt(params.cursor) };
        }

        const [customers, total] = await Promise.all([
          prisma.customer.findMany(findArgs),
          prisma.customer.count({ where: where as any }),
        ]);

        const hasMore = customers.length > limit;
        const data = hasMore ? customers.slice(0, limit) : customers;
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
    'get_customer_detail',
    {
      title: 'Get Customer Detail',
      description:
        'Get full customer detail by ID. Includes AI analysis, orders, and recent activities.',
      inputSchema: z.object({
        id: z.string().describe('Customer ID'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { id: string }) => {
      if (!hasPermission(permissions, 'mcp:customers:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:customers:read required' }], isError: true };
      }

      try {
        const customer = await prisma.customer.findFirst({
          where: { id: BigInt(params.id), deletedAt: null },
          select: CUSTOMER_DETAIL_SELECT,
        });
        if (!customer) {
          return { content: [{ type: 'text' as const, text: 'Customer not found' }], isError: true };
        }

        const orders = await prisma.order.findMany({
          where: { customerId: BigInt(params.id), deletedAt: null },
          select: {
            id: true, status: true, totalAmount: true, createdAt: true,
            product: { select: { name: true } },
          },
          orderBy: { id: 'desc' },
          take: 10,
        });

        const leads = await prisma.lead.findMany({
          where: { customerId: BigInt(params.id), deletedAt: null },
          select: { id: true, name: true, status: true, createdAt: true },
          orderBy: { id: 'desc' },
          take: 10,
        });

        const activities = await prisma.activity.findMany({
          where: { entityType: 'CUSTOMER', entityId: BigInt(params.id) },
          select: { id: true, type: true, content: true, createdAt: true, user: { select: { name: true } } },
          orderBy: { id: 'desc' },
          take: 10,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ customer, orders, leads, recentActivities: activities }, bigIntReplacer, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
