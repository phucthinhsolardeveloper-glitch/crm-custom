import { Injectable, Logger, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma, UserRole, ImportStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { FileUploadService } from '../file-upload/file-upload.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ImportService {
  private readonly uploadDir: string;
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly fileUpload: FileUploadService,
    @InjectQueue('import') private readonly importQueue: Queue,
    configService: ConfigService,
  ) {
    this.uploadDir = configService.get('UPLOAD_DIR', './uploads');
  }

  async createImportJob(
    type: 'leads' | 'customers',
    file: { buffer: Buffer; originalname: string; mimetype: string },
    userId: bigint,
  ) {
    // Save file to uploads/imports/
    const { filePath, fileName } = await this.fileUpload.saveFile(
      file.buffer, file.originalname, file.mimetype, 'imports',
    );

    // Create import record
    const job = await this.prisma.importJob.create({
      data: {
        type,
        fileName,
        fileUrl: filePath,
        createdBy: userId,
      },
    });

    // Enqueue dry-run validation job. Worker writes previewSummary + flips status to REVIEWED.
    // User then explicitly calls /:id/start to enqueue the real insert (dryRun=false).
    await this.importQueue.add('process-import', {
      importJobId: job.id.toString(),
      type,
      filePath,
      dryRun: true,
    });

    return job;
  }

  async getStatus(id: bigint, user: { id: bigint; role: UserRole }) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Không tìm thấy import job');
    // Ownership check: only the creator or admin/manager can view
    if (user.role === UserRole.USER && job.createdBy !== user.id) {
      throw new ForbiddenException('Không có quyền xem import job này');
    }
    return job;
  }

  /**
   * Resolve absolute path of a job's error CSV for download.
   * Reuses getStatus() for ownership check; validates path traversal.
   */
  async getErrorFilePath(id: bigint, user: { id: bigint; role: UserRole }) {
    const job = await this.getStatus(id, user);
    if (!job.errorFileUrl) {
      throw new NotFoundException('Job này không có file lỗi');
    }

    // Resolve paths and ensure the target stays inside uploadDir (defense against
    // tampered DB values containing '..' or absolute paths).
    const baseDir = path.resolve(this.uploadDir);
    const absolutePath = path.resolve(baseDir, job.errorFileUrl);
    if (absolutePath !== baseDir && !absolutePath.startsWith(baseDir + path.sep)) {
      throw new ForbiddenException('Đường dẫn file không hợp lệ');
    }

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File lỗi không còn tồn tại trên server');
    }

    return { absolutePath, downloadName: `import-errors-${id}.csv` };
  }

  /**
   * Transition a REVIEWED job to PROCESSING and enqueue the real insert.
   * Atomic update with status guard prevents double-start race condition.
   * Activity log deferred until EntityType.IMPORT_JOB exists in schema.
   */
  async startImport(id: bigint, user: { id: bigint; role: UserRole }) {
    const job = await this.getStatus(id, user);
    if (job.status !== ImportStatus.REVIEWED) {
      throw new ConflictException(
        `Không thể start import ở trạng thái ${job.status}. Chỉ cho phép khi REVIEWED.`,
      );
    }

    const result = await this.prisma.importJob.updateMany({
      where: { id, status: ImportStatus.REVIEWED },
      data: { status: ImportStatus.PROCESSING, startedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException('Job đã chuyển trạng thái khác - hãy reload và thử lại');
    }

    await this.importQueue.add('process-import', {
      importJobId: id.toString(),
      type: job.type as 'leads' | 'customers',
      filePath: job.fileUrl,
      dryRun: false,
    });

    return this.prisma.importJob.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Transition PENDING_REVIEW or REVIEWED to CANCELLED. Best-effort unlinks the
   * uploaded CSV to avoid stale file accumulation. CANCELLED rows are kept for audit.
   */
  async cancelImport(id: bigint, user: { id: bigint; role: UserRole }) {
    const job = await this.getStatus(id, user);
    const cancellable: ImportStatus[] = [ImportStatus.PENDING_REVIEW, ImportStatus.REVIEWED];
    if (!cancellable.includes(job.status)) {
      throw new ConflictException(
        `Không thể huỷ import ở trạng thái ${job.status}.`,
      );
    }

    const result = await this.prisma.importJob.updateMany({
      where: { id, status: { in: cancellable } },
      data: { status: ImportStatus.CANCELLED, completedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException('Job đã chuyển trạng thái khác - hãy reload và thử lại');
    }

    if (job.fileUrl) {
      const baseDir = path.resolve(this.uploadDir);
      const absolutePath = path.resolve(baseDir, job.fileUrl);
      const insideUploadDir =
        absolutePath === baseDir || absolutePath.startsWith(baseDir + path.sep);
      if (insideUploadDir) {
        try {
          await fs.promises.unlink(absolutePath);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          this.logger.warn(`Cancel import job ${id}: unlink CSV failed - ${message}`);
        }
      } else {
        this.logger.warn(`Cancel import job ${id}: fileUrl outside uploadDir, skip unlink`);
      }
    }

    return this.prisma.importJob.findUniqueOrThrow({ where: { id } });
  }

  async list(userId: bigint, limit = 20, cursor?: string) {
    const take = limit + 1;
    const jobs = await this.prisma.importJob.findMany({
      where: { createdBy: userId },
      orderBy: { id: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });

    const hasMore = jobs.length > limit;
    const data = hasMore ? jobs.slice(0, limit) : jobs;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }
}
