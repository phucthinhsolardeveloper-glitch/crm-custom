import { Module } from '@nestjs/common';
import { LeadGroupsController } from './lead-groups.controller';
import { LeadGroupsService } from './lead-groups.service';

@Module({
  controllers: [LeadGroupsController],
  providers: [LeadGroupsService],
  exports: [LeadGroupsService],
})
export class LeadGroupsModule {}
