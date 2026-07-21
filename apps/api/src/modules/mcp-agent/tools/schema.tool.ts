import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

/** Register get_schema tool - returns available tools, filters, and enum values */
export function registerSchemaTools(
  server: McpServer,
  _prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'get_schema',
    {
      title: 'Get CRM Schema',
      description:
        'Returns available MCP tools, their filters, enum values, and field descriptions. ' +
        'Call this first to understand what data you can query.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      if (!hasPermission(permissions, 'mcp:schema:read')) {
        return {
          content: [{ type: 'text' as const, text: 'Permission denied: mcp:schema:read required' }],
          isError: true,
        };
      }

      const schema = {
        server: { name: 'crm-custom-mcp', version: '1.0.0', mode: 'read-only' },
        tools: [
          {
            name: 'search_leads',
            permission: 'mcp:leads:read',
            description: 'Search leads with filters. Returns summary list.',
            filters: {
              search: 'string - search by name, phone, email',
              status: 'POOL | ASSIGNED | IN_PROGRESS | CONVERTED | LOST | FLOATING',
              departmentId: 'string (bigint) - filter by department',
              userId: 'string (bigint) - filter by assigned user',
              sourceId: 'string (bigint) - filter by lead source',
              labelId: 'string (bigint) - filter by label',
              dateFrom: 'ISO date - created after',
              dateTo: 'ISO date - created before',
              limit: 'number 1-100, default 20',
              cursor: 'string (bigint) - cursor for pagination',
            },
          },
          {
            name: 'get_lead_detail',
            permission: 'mcp:leads:read',
            description: 'Get full lead detail by ID, includes recent activities and notes.',
            params: { id: 'string (bigint) - lead ID' },
          },
          {
            name: 'search_customers',
            permission: 'mcp:customers:read',
            description: 'Search customers with filters. Returns summary list.',
            filters: {
              search: 'string - search by name, phone, email',
              status: 'ACTIVE | INACTIVE | FLOATING',
              departmentId: 'string (bigint)',
              userId: 'string (bigint)',
              labelId: 'string (bigint)',
              dateFrom: 'ISO date',
              dateTo: 'ISO date',
              limit: 'number 1-100, default 20',
              cursor: 'string (bigint)',
            },
          },
          {
            name: 'get_customer_detail',
            permission: 'mcp:customers:read',
            description: 'Get full customer detail by ID, includes orders, activities, AI analysis.',
            params: { id: 'string (bigint)' },
          },
          {
            name: 'search_orders',
            permission: 'mcp:orders:read',
            description: 'Search orders with filters.',
            filters: {
              search: 'string - customer name, phone, order key',
              status: 'PENDING | COMPLETED',
              productId: 'string (bigint)',
              createdBy: 'string (bigint)',
              dateFrom: 'ISO date',
              dateTo: 'ISO date',
              limit: 'number 1-100, default 20',
              cursor: 'string (bigint)',
            },
          },
          {
            name: 'get_order_detail',
            permission: 'mcp:orders:read',
            description: 'Get order detail by ID, includes payments.',
            params: { id: 'string (bigint)' },
          },
          {
            name: 'list_products',
            permission: 'mcp:products:read',
            description: 'List products with optional category filter.',
            filters: {
              categoryId: 'string (bigint)',
              search: 'string - product name',
              limit: 'number 1-100, default 20',
            },
          },
          {
            name: 'get_stats',
            permission: 'mcp:stats:read',
            description: 'Get dashboard KPIs. Supports date range.',
            filters: {
              dateFrom: 'ISO date',
              dateTo: 'ISO date',
              departmentId: 'string (bigint) - scope to department',
            },
          },
          {
            name: 'list_users',
            permission: 'mcp:users:read',
            description: 'List users (name, role, department only - no sensitive fields).',
            filters: {
              departmentId: 'string (bigint)',
              role: 'SUPER_ADMIN | MANAGER | USER',
              limit: 'number 1-100, default 50',
            },
          },
          {
            name: 'get_revenue_trend',
            permission: 'mcp:stats:read',
            description: 'Daily revenue breakdown for a date range.',
            filters: { dateFrom: 'ISO date (required)', dateTo: 'ISO date (required)' },
          },
          {
            name: 'get_top_performers',
            permission: 'mcp:stats:read',
            description: 'Top 10 sales users by converted leads and revenue.',
            filters: { dateFrom: 'ISO date (required)', dateTo: 'ISO date (required)' },
          },
          {
            name: 'get_dept_performance',
            permission: 'mcp:stats:read',
            description: 'Revenue, leads, conversions per department.',
            filters: { dateFrom: 'ISO date (required)', dateTo: 'ISO date (required)' },
          },
          {
            name: 'get_team_performance',
            permission: 'mcp:stats:read',
            description: 'Revenue, leads, conversions per team within departments.',
            filters: { dateFrom: 'ISO date (required)', dateTo: 'ISO date (required)' },
          },
          {
            name: 'get_leads_by_source',
            permission: 'mcp:stats:read',
            description: 'Lead count and conversion rate per acquisition source.',
            filters: { dateFrom: 'ISO date (required)', dateTo: 'ISO date (required)' },
          },
          {
            name: 'get_conversion_trend',
            permission: 'mcp:stats:read',
            description: 'Daily new leads vs converted trend.',
            filters: { dateFrom: 'ISO date (required)', dateTo: 'ISO date (required)' },
          },
          {
            name: 'get_lead_aging',
            permission: 'mcp:stats:read',
            description: 'Stale lead buckets: 0-1, 1-3, 3-7, 7+ days without interaction.',
            filters: {},
          },
          {
            name: 'analyze_lead_quality',
            permission: 'mcp:stats:read',
            description: 'Lead quality + ROI. Provide adSpend for CPL/CPA/ROAS calculation.',
            filters: {
              dateFrom: 'ISO date (required)',
              dateTo: 'ISO date (required)',
              adSpend: 'number (VND) - optional, enables ROI metrics',
              sourceId: 'string (bigint) - optional, filter to specific source',
            },
          },
          {
            name: 'analyze_ads_effectiveness',
            permission: 'mcp:stats:read',
            description: 'Deep ads analysis: phone dedup, true duplicates, multi-product interest, revenue per source, conversion time, source×product matrix.',
            filters: {
              dateFrom: 'ISO date (required)',
              dateTo: 'ISO date (required)',
              adSpend: 'number (VND) - optional, for CPL per source',
              sourceId: 'string (bigint) - optional, filter to specific source',
            },
          },
          {
            name: 'get_reference_data',
            permission: 'mcp:reference:read',
            description: 'All lookup tables (id + name) in one call: sources, labels, departments, teams, paymentTypes, tiers, productCategories, productGroups. Call this to resolve IDs for filters.',
            filters: {},
          },
          {
            name: 'get_revenue_breakdown',
            permission: 'mcp:stats:read',
            description: 'Revenue in a period split by verify-status, source, and sale (order creator). Date axis = payment.createdAt. total/bySource/bySale = VERIFIED only; byVerifyStatus shows verified/pending/rejected/refunded. Excludes soft-deleted + CANCELLED/REFUNDED orders.',
            filters: {
              dateFrom: 'ISO date (required)',
              dateTo: 'ISO date (required)',
              departmentId: 'string (bigint) - optional, via order lead department',
            },
          },
          {
            name: 'get_tier_distribution',
            permission: 'mcp:customers:read',
            description: 'Customer count + total spending per tier, with a "Chưa xếp hạng" bucket. Non-deleted customers only.',
            filters: {
              departmentId: 'string (bigint) - optional, assigned department',
              userId: 'string (bigint) - optional, assigned user',
            },
          },
          {
            name: 'get_tier_upgrades',
            permission: 'mcp:customers:read',
            description: 'Tier changes in a period (TIER_CHANGE activities). Default period = current month. Returns summary (by target tier + direction) and list (from/to tier, direction up|down|init). List capped at 200, totalCount exact.',
            filters: {
              dateFrom: 'ISO date - optional, default start of current month',
              dateTo: 'ISO date - optional, default now',
            },
          },
        ],
        enums: {
          LeadStatus: ['POOL', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING'],
          CustomerStatus: ['ACTIVE', 'INACTIVE', 'FLOATING'],
          OrderStatus: ['PENDING', 'COMPLETED'],
          PaymentStatus: ['PENDING', 'VERIFIED', 'REJECTED', 'REFUNDED', 'CANCELLED'],
          UserRole: ['SUPER_ADMIN', 'MANAGER', 'LEADER', 'USER'],
          TierChangeDirection: ['up', 'down', 'init'],
        },
        notes: [
          'All IDs are BigInt serialized as strings',
          'Dates in ISO 8601 format',
          'Vietnamese language context (field names, status labels)',
          'Default limit is 20, max 100 per request',
          'Use cursor for pagination (pass last item ID)',
        ],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(schema, null, 2) }],
      };
    },
  );
}
