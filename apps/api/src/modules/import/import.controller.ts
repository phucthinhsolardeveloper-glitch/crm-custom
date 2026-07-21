import { Controller, Get, Post, Param, Query, UseInterceptors, UploadedFile, BadRequestException, Res, StreamableFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { ImportService } from './import.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { createReadStream } from 'fs';
import type { Response } from 'express';

const CSV_UPLOAD_OPTIONS = {
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const okMime = ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'].includes(file.mimetype);
    const okExt = /\.csv$/i.test(file.originalname);
    if (!okMime && !okExt) {
      return cb(new BadRequestException('Chỉ chấp nhận file CSV (.csv)'), false);
    }
    cb(null, true);
  },
};

@Controller('imports')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Post('leads')
  @UseInterceptors(FileInterceptor('file', CSV_UPLOAD_OPTIONS))
  async importLeads(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Vui lòng upload file CSV');
    const data = await this.service.createImportJob('leads', file, user.id);
    return { data };
  }

  @Post('customers')
  @UseInterceptors(FileInterceptor('file', CSV_UPLOAD_OPTIONS))
  async importCustomers(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Vui lòng upload file CSV');
    const data = await this.service.createImportJob('customers', file, user.id);
    return { data };
  }

  @Get()
  async list(@CurrentUser() user: any, @Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.list(user.id, limit ?? 20, cursor);
  }

  @Get(':id/status')
  async getStatus(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.service.getStatus(id, user);
    return { data };
  }

  @Post(':id/start')
  async startImport(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.service.startImport(id, user);
    return { data };
  }

  @Post(':id/cancel')
  async cancelImport(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.service.cancelImport(id, user);
    return { data };
  }

  /**
   * Download the error CSV for an import job.
   * Guarded by role (manager+) at class level and by ownership check in service.
   */
  @Get(':id/error-file')
  async downloadErrorFile(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { absolutePath, downloadName } = await this.service.getErrorFilePath(id, user);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
    });
    return new StreamableFile(createReadStream(absolutePath));
  }
}
