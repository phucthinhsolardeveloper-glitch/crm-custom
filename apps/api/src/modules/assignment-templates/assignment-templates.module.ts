import { Module } from '@nestjs/common';
import { AssignmentTemplatesController } from './assignment-templates.controller';
import { AssignmentTemplatesService } from './assignment-templates.service';

@Module({
  controllers: [AssignmentTemplatesController],
  providers: [AssignmentTemplatesService],
  exports: [AssignmentTemplatesService],
})
export class AssignmentTemplatesModule {}
