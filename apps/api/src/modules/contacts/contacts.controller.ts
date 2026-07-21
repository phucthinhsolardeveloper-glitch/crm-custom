import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  /** Lookup contact (lead/customer) theo SDT. Dung cho OmiCall incoming call popup. */
  @Get('lookup')
  async lookup(@Query('phone') phone?: string) {
    if (!phone) throw new BadRequestException('phone là bắt buộc');
    const result = await this.service.lookupByPhone(phone);
    return { data: result };
  }
}
