import { Module } from '@nestjs/common';
import { OrderFormatsController } from './order-formats.controller';
import { OrderFormatsService } from './order-formats.service';

@Module({
  controllers: [OrderFormatsController],
  providers: [OrderFormatsService],
})
export class OrderFormatsModule {}
