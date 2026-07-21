import { Module } from '@nestjs/common';
import { DepartmentViewConfigsController } from './department-view-configs.controller';
import { DepartmentViewConfigsService } from './department-view-configs.service';

@Module({
  controllers: [DepartmentViewConfigsController],
  providers: [DepartmentViewConfigsService],
  exports: [DepartmentViewConfigsService],
})
export class DepartmentViewConfigsModule {}
