import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const ORDER_SUMMARY_SELECT = {
  id: true, status: true, totalAmount: true, amount: true,
  vatRate: true, vatAmount: true, customerName: true, customerPhone: true,
  createdAt: true, updatedAt: true,
  customer: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  orderFormat: { select: { id: true, name: true } },
  productGroup: { select: { id: true, name: true } },
};

const ORDER_DETAIL_SELECT = {
  ...ORDER_SUMMARY_SELECT,
  leadId: true, customerId: true, productId: true, createdBy: true,
  notes: true, companyName: true, taxCode: true, contactPerson: true,
  address: true, format: true, groupType: true, stt: true, courseCode: true,
  vatEmail: true, formatId: true, productGroupId: true,
  lead: { select: { id: true, name: true, phone: true, status: true } },
  payments: {
    select: {
      id: true, amount: true, status: true, transferContent: true,
      verifiedSource: true, verifiedAt: true, createdAt: true,
      paymentType: { select: { id: true, name: true } },
    },
  },
};

const searchOrdersSchema = z.object({
  search: z.string().optional().describe('Search by customer name, phone, or course code'),
  status: z.enum(['PENDING', 'COMPLETED']).optional(),
  productId: z.string().optional().describe('Filter by product ID'),
  createdBy: z.string().optional().describe('Filter by creator user ID'),
  customerId: z.string().optional().describe('Filter by customer ID'),
  dateFrom: z.string().optional().describe('Created after (ISO date)'),
  dateTo: z.string().optional().describe('Created before (ISO date)'),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional().describe('Cursor for next page'),
});

type SearchOrdersParams = z.infer<typeof searchOrdersSchema>;

export function registerOrdersTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'search_orders',
    {
      title: 'Search Orders',
      description:
        'Search CRM orders with filters. Returns order summary with customer and product info.',
      inputSchema: searchOrdersSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: SearchOrdersParams) => {
      if (!hasPermission(permissions, 'mcp:orders:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:orders:read required' }], isError: true };
      }

      try {
        const where: Record<string, unknown> = { deletedAt: null };
        if (params.status) where.status = params.status;
        if (params.productId) where.productId = BigInt(params.productId);
        if (params.createdBy) where.createdBy = BigInt(params.createdBy);
        if (params.customerId) where.customerId = BigInt(params.customerId);
        if (params.dateFrom || params.dateTo) {
          where.createdAt = {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo + 'T23:59:59Z') } : {}),
          };
        }
        if (params.search) {
          where.OR = [
            { customerName: { contains: params.search, mode: 'insensitive' } },
            { customerPhone: { contains: params.search } },
            { courseCode: { contains: params.search, mode: 'insensitive' } },
            { customer: { name: { contains: params.search, mode: 'insensitive' } } },
          ];
        }

        const limit = params.limit;
        const findArgs: any = {
          where, select: ORDER_SUMMARY_SELECT, orderBy: { id: 'desc' }, take: limit + 1,
        };
        if (params.cursor) {
          findArgs.skip = 1;
          findArgs.cursor = { id: BigInt(params.cursor) };
        }

        const [orders, total] = await Promise.all([
          prisma.order.findMany(findArgs),
          prisma.order.count({ where: where as any }),
        ]);

        const hasMore = orders.length > limit;
        const data = hasMore ? orders.slice(0, limit) : orders;
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
    'get_order_detail',
    {
      title: 'Get Order Detail',
      description:
        'Get full order detail by ID. Includes payments, lead info, and product details.',
      inputSchema: z.object({
        id: z.string().describe('Order ID'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { id: string }) => {
      if (!hasPermission(permissions, 'mcp:orders:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:orders:read required' }], isError: true };
      }

      try {
        const order = await prisma.order.findFirst({
          where: { id: BigInt(params.id), deletedAt: null },
          select: ORDER_DETAIL_SELECT as any,
        });
        if (!order) {
          return { content: [{ type: 'text' as const, text: 'Order not found' }], isError: true };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ order }, bigIntReplacer, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
