import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Register get_reference_data - one call returns every lookup table the AI
 * needs to build filters (id + name) for the other tools. Without this the AI
 * is "ID-blind" and cannot construct sourceId/labelId/tierId/... filters.
 */
export function registerReferenceTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'get_reference_data',
    {
      title: 'Get Reference Data',
      description:
        'Returns all CRM lookup tables in one call (id + name): lead sources, ' +
        'labels, departments, teams, payment types, customer tiers, product ' +
        'categories, product groups. Use the returned IDs to build filters for ' +
        'other tools (sourceId, labelId, departmentId, tierId...).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      if (!hasPermission(permissions, 'mcp:reference:read')) {
        return {
          content: [{ type: 'text' as const, text: 'Permission denied: mcp:reference:read required' }],
          isError: true,
        };
      }

      try {
        const [
          sources,
          labels,
          departments,
          teams,
          paymentTypes,
          tiers,
          productCategories,
          productGroups,
        ] = await Promise.all([
          prisma.leadSource.findMany({
            where: { isActive: true },
            select: { id: true, name: true, skipPool: true },
            orderBy: { name: 'asc' },
          }),
          prisma.label.findMany({
            where: { isActive: true },
            select: { id: true, name: true, color: true, textColor: true, category: true },
            orderBy: { name: 'asc' },
          }),
          prisma.department.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
          prisma.team.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, departmentId: true },
            orderBy: { name: 'asc' },
          }),
          prisma.paymentType.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
          prisma.customerTier.findMany({
            where: { isActive: true },
            select: { id: true, name: true, slug: true, minSpending: true, color: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          }),
          prisma.productCategory.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
          prisma.productGroup.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
        ]);

        const result = {
          sources,
          labels,
          departments,
          teams,
          paymentTypes,
          tiers,
          productCategories,
          productGroups,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, bigIntReplacer, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
