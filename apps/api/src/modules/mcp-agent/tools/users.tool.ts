import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const listUsersSchema = z.object({
  departmentId: z.string().optional().describe('Filter by department ID'),
  role: z.enum(['SUPER_ADMIN', 'MANAGER', 'USER']).optional(),
  activeOnly: z.boolean().default(true).describe('Only show active users'),
  limit: z.number().int().min(1).max(100).default(50),
});

type ListUsersParams = z.infer<typeof listUsersSchema>;

export function registerUsersTools(
  server: McpServer,
  prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'list_users',
    {
      title: 'List Users',
      description:
        'List CRM users with role and department info. ' +
        'Returns only non-sensitive fields (name, role, department). No email/phone.',
      inputSchema: listUsersSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: ListUsersParams) => {
      if (!hasPermission(permissions, 'mcp:users:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:users:read required' }], isError: true };
      }

      try {
        const where: Record<string, unknown> = { deletedAt: null };
        if (params.activeOnly) where.status = 'ACTIVE';
        if (params.departmentId) where.departmentId = BigInt(params.departmentId);
        if (params.role) where.role = params.role;

        const users = await prisma.user.findMany({
          where: where as any,
          select: {
            id: true, name: true, role: true, status: true,
            department: { select: { id: true, name: true } },
            team: { select: { id: true, name: true } },
            employeeLevel: { select: { id: true, name: true, rank: true } },
          },
          orderBy: { name: 'asc' },
          take: params.limit,
        });

        // Also return reference data (departments, labels, sources)
        const [departments, labels, sources] = await Promise.all([
          prisma.department.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
          prisma.label.findMany({
            where: { isActive: true },
            select: { id: true, name: true, color: true },
            orderBy: { name: 'asc' },
          }),
          prisma.leadSource.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              users, departments, labels, sources,
              total: users.length,
            }, bigIntReplacer, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
