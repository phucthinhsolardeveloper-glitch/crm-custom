import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, UserRole, EntityType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import { buildAccessFilter, AccessFilterUser } from '../../common/filters/build-access-filter';
import { FileUploadService } from '../file-upload/file-upload.service';
import { AuditLogService } from '../audit-log/audit-log.service';

// Whitelist MIME types - ảnh + PDF + Office docs (theo plan).
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// Defense in depth: kiểm tra cả extension - không trust solely MIME header.
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type CurrentUser = AccessFilterUser;

@Injectable()
export class LeadDocumentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fileUploadService: FileUploadService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Verify user có access tới lead. Lead phải tồn tại + buildAccessFilter pass.
   * USER chỉ thấy lead assigned cho mình; MANAGER+ thấy tất cả.
   */
  private async verifyLeadAccess(
    leadId: bigint,
    user: CurrentUser,
    mode: 'read' | 'write' = 'read',
  ): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        deletedAt: null,
        ...buildAccessFilter(user, 'lead', mode),
      },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
  }

  /**
   * Upload document. Validate MIME + extension + size, save file qua FileUploadService
   * vào subdir lead-documents, tạo Document row, log audit.
   */
  async upload(
    leadId: bigint,
    file: Express.Multer.File,
    user: CurrentUser,
    description?: string,
  ) {
    if (!file) throw new BadRequestException('Vui lòng chọn file để tải lên');

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File vượt quá 5MB');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Định dạng file không được hỗ trợ');
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`Phần mở rộng ${ext} không được hỗ trợ`);
    }

    await this.verifyLeadAccess(leadId, user, 'write');

    const saved = await this.fileUploadService.saveFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      `lead-documents/${leadId}`,
    );

    const doc = await this.prisma.document.create({
      data: {
        entityType: EntityType.LEAD,
        entityId: leadId,
        uploadedBy: user.id,
        fileName: file.originalname,
        fileUrl: saved.filePath,
        fileType: file.mimetype,
        fileSize: file.size,
        description: description ?? null,
      },
      include: {
        uploader: { select: { id: true, name: true } },
      },
    });

    // Audit log thủ công - global interceptor không capture được context lead context riêng.
    await this.auditLogService.create({
      userId: user.id,
      action: 'DOCUMENT_UPLOAD',
      entityType: 'LEAD_DOCUMENT',
      entityId: doc.id,
      metadata: {
        leadId: leadId.toString(),
        fileName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
      },
    });

    return this.toDto(doc);
  }

  /** List documents của lead - filter soft-deleted, mọi user có quyền view lead đều thấy. */
  async list(leadId: bigint, user: CurrentUser) {
    await this.verifyLeadAccess(leadId, user);

    const docs = await this.prisma.document.findMany({
      where: {
        entityType: EntityType.LEAD,
        entityId: leadId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { id: true, name: true } },
      },
    });
    return docs.map((d) => this.toDto(d));
  }

  /**
   * Get absolute path để stream file. Verify access trước khi cho download.
   * Trả về cả metadata (filename gốc, MIME) để controller set headers đúng.
   */
  async getDownload(leadId: bigint, docId: bigint, user: CurrentUser) {
    await this.verifyLeadAccess(leadId, user);

    const doc = await this.prisma.document.findFirst({
      where: {
        id: docId,
        entityType: EntityType.LEAD,
        entityId: leadId,
        deletedAt: null,
      },
    });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');

    const securePath = this.fileUploadService.getSecurePath(doc.fileUrl);
    if (!fs.existsSync(securePath)) {
      throw new NotFoundException('File không tồn tại trên ổ đĩa');
    }

    return {
      absolutePath: securePath,
      fileName: doc.fileName,
      fileType: doc.fileType,
    };
  }

  /**
   * Soft delete document. Chỉ MANAGER+ được xóa - USER thường chặn tại controller
   * qua @Roles, ở đây thêm guard phòng bypass.
   */
  async softDelete(leadId: bigint, docId: bigint, user: CurrentUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Chỉ quản lý mới được xóa tài liệu');
    }

    await this.verifyLeadAccess(leadId, user);

    const doc = await this.prisma.document.findFirst({
      where: {
        id: docId,
        entityType: EntityType.LEAD,
        entityId: leadId,
        deletedAt: null,
      },
    });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');

    await this.prisma.document.update({
      where: { id: docId },
      data: { deletedAt: new Date() },
    });

    await this.auditLogService.create({
      userId: user.id,
      action: 'DOCUMENT_DELETE',
      entityType: 'LEAD_DOCUMENT',
      entityId: doc.id,
      metadata: {
        leadId: leadId.toString(),
        fileName: doc.fileName,
      },
    });

    return { success: true };
  }

  private toDto(doc: any) {
    return {
      id: doc.id.toString(),
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      description: doc.description,
      createdAt: doc.createdAt,
      uploader: doc.uploader
        ? { id: doc.uploader.id.toString(), name: doc.uploader.name }
        : null,
    };
  }
}
