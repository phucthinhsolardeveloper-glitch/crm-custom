import { Module } from '@nestjs/common';
import { LeadDocumentsController } from './lead-documents.controller';
import { LeadDocumentsService } from './lead-documents.service';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [FileUploadModule, AuditLogModule],
  controllers: [LeadDocumentsController],
  providers: [LeadDocumentsService],
})
export class LeadDocumentsModule {}
