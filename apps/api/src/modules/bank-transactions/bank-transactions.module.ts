import { Module } from '@nestjs/common';
import { BankTransactionsController } from './bank-transactions.controller';
import { BankTransactionsService } from './bank-transactions.service';
import { BankTransactionImportService } from './bank-transaction-import.service';
import { PaymentMatchingService } from '../payments/payment-matching.service';
import { CustomerTiersModule } from '../customer-tiers/customer-tiers.module';

// CustomerTiersModule cần thiết vì PaymentMatchingService constructor inject
// CustomerTierRecalcService. Module này declare local instance của PaymentMatchingService
// (không qua PaymentsModule re-export), nên phải import dep module trực tiếp.
@Module({
  imports: [CustomerTiersModule],
  controllers: [BankTransactionsController],
  providers: [BankTransactionsService, BankTransactionImportService, PaymentMatchingService],
  exports: [BankTransactionsService],
})
export class BankTransactionsModule {}
