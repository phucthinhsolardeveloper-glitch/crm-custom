import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { DashboardService } from '../dashboard/dashboard.service';
import { registerLeadsTools } from './tools/leads.tool';
import { registerCustomersTools } from './tools/customers.tool';
import { registerOrdersTools } from './tools/orders.tool';
import { registerProductsTools } from './tools/products.tool';
import { registerStatsTools } from './tools/stats.tool';
import { registerUsersTools } from './tools/users.tool';
import { registerSchemaTools } from './tools/schema.tool';
import { registerAnalyticsTools } from './tools/analytics.tool';
import { registerReferenceTools } from './tools/reference.tool';
import { registerRevenueTools } from './tools/revenue.tool';
import { registerTierTools } from './tools/tiers.tool';

@Injectable()
export class McpAgentService implements OnModuleDestroy {
  private readonly logger = new Logger(McpAgentService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly dashboardService: DashboardService,
  ) {}

  /** Create a fresh MCP server with all read-only tools registered */
  private createServer(permissions: string[]): McpServer {
    const server = new McpServer({
      name: 'crm-custom-mcp',
      version: '1.0.0',
    });

    // Register all read-only tools (each checks permissions internally)
    registerSchemaTools(server, this.prisma, permissions);
    registerLeadsTools(server, this.prisma, permissions);
    registerCustomersTools(server, this.prisma, permissions);
    registerOrdersTools(server, this.prisma, permissions);
    registerProductsTools(server, this.prisma, permissions);
    registerStatsTools(server, this.prisma, permissions);
    registerUsersTools(server, this.prisma, permissions);
    registerAnalyticsTools(server, this.prisma, this.dashboardService, permissions);
    registerReferenceTools(server, this.prisma, permissions);
    registerRevenueTools(server, this.prisma, permissions);
    registerTierTools(server, this.prisma, permissions);

    return server;
  }

  /**
   * Handle POST /mcp - Stateless Streamable HTTP.
   * Each request creates a fresh server + transport, processes, then tears down.
   * No session management needed for read-only tools.
   */
  async handlePost(req: Request, res: Response): Promise<void> {
    const permissions: string[] =
      (req as any).mcpApiKey?.permissions ?? [];

    try {
      const server = this.createServer(permissions);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless - no sessions
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      // Cleanup after response is sent
      res.on('finish', () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });
    } catch (error) {
      this.logger.error('MCP request failed', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  /** GET and DELETE return 405 in stateless mode */
  handleMethodNotAllowed(res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for stateless MCP.',
      },
      id: null,
    });
  }

  async onModuleDestroy() {
    this.logger.log('MCP Agent module destroyed');
  }
}
