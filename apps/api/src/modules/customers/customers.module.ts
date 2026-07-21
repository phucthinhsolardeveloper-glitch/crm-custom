import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerPhonesService } from './customer-phones.service';
import { CustomerBirthdayCron } from './cron/customer-birthday.cron';
import { LabelsModule } from '../labels/labels.module';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [LabelsModule, AiSummaryModule, FileUploadModule, NotificationsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerPhonesService, CustomerBirthdayCron],
  exports: [CustomersService, CustomerPhonesService],
})
export class CustomersModule {}
