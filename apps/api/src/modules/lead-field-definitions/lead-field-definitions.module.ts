import { Module } from '@nestjs/common';
import { LeadFieldDefinitionsController } from './lead-field-definitions.controller';
import { LeadFieldDefinitionsService } from './lead-field-definitions.service';

@Module({
  controllers: [LeadFieldDefinitionsController],
  providers: [LeadFieldDefinitionsService],
  exports: [LeadFieldDefinitionsService],
})
export class LeadFieldDefinitionsModule {}
