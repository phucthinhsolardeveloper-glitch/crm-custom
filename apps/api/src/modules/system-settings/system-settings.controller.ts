import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { SystemSettingsService } from './system-settings.service';

@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  /** Get all settings. SUPER_ADMIN only. */
  @Get()
  @Roles('SUPER_ADMIN')
  async getAll() {
    return { data: await this.service.getAll() };
  }

  /** Upsert a setting by key. SUPER_ADMIN only. */
  @Put(':key')
  @Roles('SUPER_ADMIN')
  async set(@Param('key') key: string, @Body() body: { value: string }) {
    await this.service.set(key, body.value);
    return { data: { key, value: this.service.maskIfSecret(key, body.value) } };
  }
}
