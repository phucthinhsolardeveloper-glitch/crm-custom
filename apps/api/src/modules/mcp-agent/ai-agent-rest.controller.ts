import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public-route.decorator';
import { McpAgentAuthGuard } from './mcp-agent-auth.guard';
import { McpAgentQueryService } from './mcp-agent-query.service';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

/**
 * REST endpoints for AI agents that don't support MCP protocol.
 * Same data, same auth (x-api-key), same filters as MCP tools.
 * Requires mcp:* permissions on API key.
 */
@Controller('ai-agent')
@Public()
@UseGuards(McpAgentAuthGuard)
export class AiAgentRestController {
  constructor(private readonly queryService: McpAgentQueryService) {}

  @Get('leads')
  async searchLeads(@Query() query: Record<string, string>) {
    return { data: await this.queryService.searchLeads({
      search: query.search, status: query.status,
      departmentId: query.departmentId, userId: query.userId,
      sourceId: query.sourceId, labelId: query.labelId,
      dateFrom: query.dateFrom, dateTo: query.dateTo,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    }) };
  }

  @Get('leads/:id')
  async getLeadDetail(@Param('id', ParseBigIntPipe) id: bigint) {
    const result = await this.queryService.getLeadDetail(String(id));
    if (!result) return { error: 'Lead not found' };
    return { data: result };
  }

  @Get('customers')
  async searchCustomers(@Query() query: Record<string, string>) {
    return { data: await this.queryService.searchCustomers({
      search: query.search, status: query.status,
      departmentId: query.departmentId, userId: query.userId,
      labelId: query.labelId, dateFrom: query.dateFrom, dateTo: query.dateTo,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    }) };
  }

  @Get('orders')
  async searchOrders(@Query() query: Record<string, string>) {
    return { data: await this.queryService.searchOrders({
      search: query.search, status: query.status,
      productId: query.productId, createdBy: query.createdBy,
      customerId: query.customerId, dateFrom: query.dateFrom, dateTo: query.dateTo,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    }) };
  }

  @Get('stats')
  async getStats(@Query() query: Record<string, string>) {
    return { data: await this.queryService.getStats({
      dateFrom: query.dateFrom, dateTo: query.dateTo,
      departmentId: query.departmentId,
    }) };
  }
}
