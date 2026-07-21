import { Module } from '@nestjs/common';
import { UserPhonesController } from './user-phones.controller';
import { UserPhonesService } from './user-phones.service';
import { UserPhonesRepository } from './user-phones.repository';

@Module({
  controllers: [UserPhonesController],
  providers: [UserPhonesService, UserPhonesRepository],
  exports: [UserPhonesService],
})
export class UserPhonesModule {}
