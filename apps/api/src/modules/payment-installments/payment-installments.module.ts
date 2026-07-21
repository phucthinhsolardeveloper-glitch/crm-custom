import { Module } from '@nestjs/common';
import { PaymentInstallmentsController } from './payment-installments.controller';
import { PaymentInstallmentsService } from './payment-installments.service';

@Module({
  controllers: [PaymentInstallmentsController],
  providers: [PaymentInstallmentsService],
})
export class PaymentInstallmentsModule {}
