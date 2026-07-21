import { Module } from '@nestjs/common';
import { AiSummaryService } from './ai-summary.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  providers: [AiSummaryService],
  exports: [AiSummaryService],
})
export class AiSummaryModule {}
