import { Inject, Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

const ALLOWED_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/csv',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class FileUploadService {
  private readonly uploadDir: string;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    this.uploadDir = this.configService.get('UPLOAD_DIR', './uploads');
  }

  /**
   * Save uploaded file to local filesystem.
   * Returns relative path from upload root.
   */
  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
    subDir: string = 'attachments',
  ): Promise<{ filePath: string; fileName: string; fileSize: number }> {
    // Validate size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('File vượt quá 10MB');
    }
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      throw new BadRequestException('Loại file không được hỗ trợ');
    }

    // Validate magic bytes - prevent MIME spoofing (e.g., .php uploaded as image/jpeg)
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(buffer);
    // CSV/plain text files have no magic bytes - skip for text types
    if (detected && !ALLOWED_MIME_TYPES.includes(detected.mime)) {
      throw new BadRequestException(`File thực tế là ${detected.mime}, không được hỗ trợ`);
    }

    // Generate safe filename
    const ext = path.extname(originalName).toLowerCase() || '.bin';
    const uuid = uuidv4();
    const fileName = `${uuid}${ext}`;

    // Organize by year-month
    const now = new Date();
    const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dirPath = path.join(this.uploadDir, subDir, monthDir);

    // Ensure directory exists
    fs.mkdirSync(dirPath, { recursive: true });

    // Write file
    const fullPath = path.join(dirPath, fileName);
    fs.writeFileSync(fullPath, buffer);

    // Return relative path
    const filePath = `${subDir}/${monthDir}/${fileName}`;
    return { filePath, fileName: originalName, fileSize: buffer.length };
  }

  /**
   * Resolve relative path to absolute, with path traversal protection.
   * Throws ForbiddenException if path escapes upload directory.
   */
  getSecurePath(relativePath: string): string {
    // Lớp 3: Whitelist - cho phép 1+ segment thư mục an toàn rồi YYYY-MM/uuid.ext.
    // Hỗ trợ cả path phẳng (avatars/2026-06/uuid.jpg) lẫn nested
    // (lead-documents/123/2026-06/uuid.pdf). [\w-]+ không match '.' nên '..' bị chặn.
    const SAFE_PATH_PATTERN = /^(?:[\w-]+\/)+\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\w+$/;
    if (!SAFE_PATH_PATTERN.test(relativePath)) {
      throw new ForbiddenException('Đường dẫn file không hợp lệ');
    }

    // Lớp 2: Path normalization - chống ../../ traversal
    const resolvedUploadDir = path.resolve(this.uploadDir);
    const resolvedFilePath = path.resolve(this.uploadDir, relativePath);

    if (!resolvedFilePath.startsWith(resolvedUploadDir + path.sep)) {
      throw new ForbiddenException('Truy cập file bị từ chối');
    }

    return resolvedFilePath;
  }

  /** Check if file exists (with path traversal protection). */
  fileExists(relativePath: string): boolean {
    try {
      const securePath = this.getSecurePath(relativePath);
      return fs.existsSync(securePath);
    } catch {
      return false;
    }
  }
}
