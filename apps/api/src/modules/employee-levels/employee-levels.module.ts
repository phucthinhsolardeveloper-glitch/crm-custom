import { Module } from '@nestjs/common';
import { EmployeeLevelsController } from './employee-levels.controller';
import { EmployeeLevelsService } from './employee-levels.service';

@Module({
  controllers: [EmployeeLevelsController],
  providers: [EmployeeLevelsService],
  exports: [EmployeeLevelsService],
})
export class EmployeeLevelsModule {}
