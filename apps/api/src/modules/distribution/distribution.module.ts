import { Module } from '@nestjs/common';
import { DistributionController } from './distribution.controller';
import { DistributionService } from './distribution.service';
import { ScoringService } from './scoring.service';

@Module({
  controllers: [DistributionController],
  providers: [DistributionService, ScoringService],
  exports: [DistributionService],
})
export class DistributionModule {}
