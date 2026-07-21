import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LabelsModule } from '../labels/labels.module';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeadFieldDefinitionsModule } from '../lead-field-definitions/lead-field-definitions.module';

@Module({
  imports: [LabelsModule, CustomersModule, NotificationsModule, LeadFieldDefinitionsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
