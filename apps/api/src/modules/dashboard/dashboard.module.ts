import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardBlocksService } from './dashboard-blocks.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardBlocksService],
  exports: [DashboardService],
})
export class DashboardModule {}
