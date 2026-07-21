import { Controller, Get } from '@nestjs/common';
import { ReferenceDataService } from './reference-data.service';

@Controller('reference-data')
export class ReferenceDataController {
  constructor(private readonly service: ReferenceDataService) {}

  // Tem phiên bản mọi lookup dùng chung trong 1 request - FE so để tự làm mới cache localStorage.
  // Không gắn @Roles: mọi user đã đăng nhập đều đọc được (data không nhạy cảm, chỉ là tem so sánh).
  @Get('versions')
  async versions() {
    return { data: await this.service.versions() };
  }
}
