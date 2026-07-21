import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { KpiTargetsController } from './kpi/kpi-targets.controller';
import { KpiTargetsService } from './kpi/kpi-targets.service';
import { KpiTargetsRepository } from './kpi/kpi-targets.repository';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [UsersController, KpiTargetsController],
  providers: [UsersService, UsersRepository, KpiTargetsService, KpiTargetsRepository],
  exports: [UsersService],
})
export class UsersModule {}
