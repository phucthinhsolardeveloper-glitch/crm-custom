import { Module } from '@nestjs/common';
import { CustomerTiersController } from './customer-tiers.controller';
import { CustomerTiersService } from './customer-tiers.service';
import { CustomerTierRecalcService } from './customer-tier-recalc.service';

@Module({
  controllers: [CustomerTiersController],
  providers: [CustomerTiersService, CustomerTierRecalcService],
  exports: [CustomerTiersService, CustomerTierRecalcService],
})
export class CustomerTiersModule {}
