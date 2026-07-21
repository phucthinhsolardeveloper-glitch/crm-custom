import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportProcessor } from './import.processor';
import { ImportValidationService } from './import-validation.service';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'import' }),
    FileUploadModule,
    CustomersModule, // expose CustomerPhonesService cho findOrCreate cross-table
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportProcessor, ImportValidationService],
})
export class ImportModule {}
