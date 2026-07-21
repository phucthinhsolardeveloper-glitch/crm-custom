import { Module } from '@nestjs/common';
import { PaymentTypesController } from './payment-types.controller';
import { PaymentTypesService } from './payment-types.service';

@Module({
  controllers: [PaymentTypesController],
  providers: [PaymentTypesService],
})
export class PaymentTypesModule {}
