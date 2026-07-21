import { Module } from '@nestjs/common';
import { ThirdPartyApiController } from './third-party-api.controller';
import { CustomersModule } from '../customers/customers.module';
import { LeadFieldDefinitionsModule } from '../lead-field-definitions/lead-field-definitions.module';

@Module({
  imports: [CustomersModule, LeadFieldDefinitionsModule], // CustomerPhonesService + validate metadata key
  controllers: [ThirdPartyApiController],
  providers: [],
})
export class ThirdPartyApiModule {}
