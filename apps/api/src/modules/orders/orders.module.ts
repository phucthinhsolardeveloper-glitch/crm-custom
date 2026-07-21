import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CustomerTiersModule } from '../customer-tiers/customer-tiers.module';
import { PaymentsModule } from '../payments/payments.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  // PaymentsModule: tao don + payment long atomic qua PaymentsService.createPaymentInTx
  // CustomersModule: expose CustomerPhonesService cho dedup SDT luc tao customer tu lead
  imports: [CustomerTiersModule, PaymentsModule, CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
