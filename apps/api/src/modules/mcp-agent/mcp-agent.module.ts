import { Module } from '@nestjs/common';
import { McpAgentController } from './mcp-agent.controller';
import { AiAgentRestController } from './ai-agent-rest.controller';
import { McpAgentService } from './mcp-agent.service';
import { McpAgentQueryService } from './mcp-agent-query.service';
import { McpAgentAuthGuard } from './mcp-agent-auth.guard';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [DashboardModule],
  controllers: [McpAgentController, AiAgentRestController],
  providers: [McpAgentService, McpAgentQueryService, McpAgentAuthGuard],
})
export class McpAgentModule {}
