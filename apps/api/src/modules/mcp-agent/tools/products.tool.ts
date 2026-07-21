import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const listProductsSchema = z.object({
  search: z.string().optional().describe('Search by product name'),
  categoryId: z.string().optional().describe('Filter by product category ID'),
  activeOnly: z.boolean().default(true).describe('Only show active products'),
  limit: z.number().int().min(1).max(100).default(20),
});

type ListProductsParams = z.infer<typeof listProductsSchema>;

export function registerProductsTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'list_products',
    {
      title: 'List Products',
      description:
        'List CRM products with optional category and search filter.',
      inputSchema: listProductsSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: ListProductsParams) => {
      if (!hasPermission(permissions, 'mcp:products:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:products:read required' }], isError: true };
      }

      try {
        const where: Record<string, unknown> = { deletedAt: null };
        if (params.activeOnly) where.isActive = true;
        if (params.categoryId) where.categoryId = BigInt(params.categoryId);
        if (params.search) {
          where.name = { contains: params.search, mode: 'insensitive' };
        }

        const products = await prisma.product.findMany({
          where: where as any,
          select: {
            id: true, name: true, price: true, vatRate: true,
            isActive: true, description: true, createdAt: true,
            category: { select: { id: true, name: true } },
          },
          orderBy: { name: 'asc' },
          take: params.limit,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ data: products, total: products.length }, bigIntReplacer, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
