import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import * as fs from 'fs';
import { LeadDocumentsService } from './lead-documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

// 5MB - khớp với validation trong service. Multer reject sớm tại đây trước khi vào buffer.
const MAX_FILE_SIZE = 5 * 1024 * 1024;

@Controller('leads/:leadId/documents')
export class LeadDocumentsController {
  constructor(private readonly service: LeadDocumentsService) {}

  /** Upload tài liệu cho lead - mọi role có quyền view lead đều upload được. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(
    @Param('leadId', ParseBigIntPipe) leadId: bigint,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.upload(leadId, file, user, body?.description);
    return { data };
  }

  @Get()
  async list(
    @Param('leadId', ParseBigIntPipe) leadId: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.list(leadId, user);
    return { data };
  }

  /** Download - stream file với tên gốc (Content-Disposition: attachment). */
  @Get(':docId/download')
  async download(
    @Param('leadId', ParseBigIntPipe) leadId: bigint,
    @Param('docId', ParseBigIntPipe) docId: bigint,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { absolutePath, fileName, fileType } = await this.service.getDownload(
      leadId,
      docId,
      user,
    );
    // RFC 5987 encoding cho filename UTF-8 (Vietnamese diacritics).
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Type', fileType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
    );
    fs.createReadStream(absolutePath).pipe(res);
  }

  /** Soft delete - chỉ MANAGER+ được xóa. Service guard double-check phòng bypass. */
  @Delete(':docId')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async delete(
    @Param('leadId', ParseBigIntPipe) leadId: bigint,
    @Param('docId', ParseBigIntPipe) docId: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.softDelete(leadId, docId, user);
    return { data };
  }
}
