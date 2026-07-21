import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient, ImportStatus, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { parse } from 'csv-parse';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { SYSTEM_ACTOR } from '../../common/event-bus/system-actor';
import { decodeBufferAuto } from './csv-detect';
import {
  ImportValidationService,
  LookupMaps,
  ParsedLead,
  ParsedCustomer,
  leadComboKey,
} from './import-validation.service';

export interface ImportJobData {
  importJobId: string;
  type: 'leads' | 'customers';
  filePath: string;
  /** When true, validate only - count + sample errors, no DB writes. */
  dryRun: boolean;
}

/** Số dòng gom mỗi lô để dedup theo batch (1 lần query/lô thay vì 1 lần/dòng). */
const CHUNK_SIZE = 500;

/** Số dòng tối đa gửi về UI để vẽ bảng xem trước (tránh payload nặng với file lớn). */
const PREVIEW_ROW_LIMIT = 200;

/** 1 dòng trong bảng xem trước: giá trị cột gốc + trạng thái màu + lý do. */
interface PreviewRow {
  row: number;
  status: 'ok' | 'warning' | 'error';
  cells: string[];
  message: string;
}

/**
 * Escape a CSV cell per RFC 4180: wrap in quotes if value contains quote/comma/newline,
 * and double up any internal quotes. Prevents row misalignment when error messages or
 * original data contain commas/quotes.
 */
function escapeCsvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

@Processor('import')
export class ImportProcessor extends WorkerHost {
  private readonly uploadDir: string;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    configService: ConfigService,
    private readonly validationService: ImportValidationService,
    private readonly cls: ClsService,
  ) {
    super();
    this.uploadDir = configService.get('UPLOAD_DIR', './uploads');
  }

  /**
   * Bulk-mode wrapper: every Prisma mutation in this worker runs with
   * `cls.mode === 'bulk'`, signaling DomainEventBridge to skip emit.
   * Prevents event-storm when importing 10K rows.
   */
  async process(job: Job<ImportJobData>) {
    return this.cls.runWith(
      { actor: SYSTEM_ACTOR, mode: 'bulk' },
      () => this.doProcess(job),
    );
  }

  private async doProcess(job: Job<ImportJobData>) {
    const { importJobId, type, filePath, dryRun } = job.data;
    const jobId = BigInt(importJobId);
    const absolutePath = path.join(this.uploadDir, filePath);

    let totalRows = 0;
    let successCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    const errors: { row: number; originalRow: Record<string, string>; message: string }[] = [];
    const warnings: { row: number; originalRow: Record<string, string>; messages: string[] }[] = [];
    let originalHeaders: string[] = [];
    // Mẫu hàng để vẽ bảng xem trước (chỉ dùng cho dry-run), tối đa PREVIEW_ROW_LIMIT.
    const previewRows: PreviewRow[] = [];
    const pushPreview = (
      r: { row: Record<string, string>; rowNum: number },
      status: PreviewRow['status'],
      message: string,
    ) => {
      if (previewRows.length >= PREVIEW_ROW_LIMIT) return;
      previewRows.push({
        row: r.rowNum,
        status,
        cells: originalHeaders.map((h) => r.row[h] ?? ''),
        message,
      });
    };

    try {
      const jobRecord = await this.prisma.importJob.findUnique({
        where: { id: jobId },
        select: { createdBy: true },
      });
      const createdBy = jobRecord?.createdBy ?? null;

      const lookups = await this.preloadLookups();
      // Cache + tập "đã thấy" giữ xuyên suốt file:
      // - phoneCache: SĐT (normalized) -> customerId, đổ từ batch + tái dùng khi insert.
      // - seenLeadCombos / seenCustomerPhones: combo/SĐT đã tồn tại (DB) hoặc đã thấy ở
      //   dòng trước -> bắt trùng cả với DB lẫn trùng nội bộ trong cùng file.
      const phoneCache = new Map<string, bigint>();
      const seenLeadCombos = new Set<string>();
      const seenCustomerPhones = new Set<string>();
      let buffer: { row: Record<string, string>; rowNum: number }[] = [];

      // Xử lý 1 lô: nạp sẵn dedup bằng query batch, rồi validate/insert từng dòng
      // trên dữ liệu in-memory (không còn query dedup per-row).
      const flushBuffer = async () => {
        if (buffer.length === 0) return;
        const rawPhones = buffer.map((b) => b.row.phone || b.row['Số điện thoại'] || '');

        if (type === 'leads') {
          const { customerByPhone, existingLeadCombos } =
            await this.validationService.buildLeadPrefetch(rawPhones);
          for (const [p, id] of customerByPhone) phoneCache.set(p, id);
          for (const k of existingLeadCombos) seenLeadCombos.add(k);
        } else {
          const existing = await this.validationService.buildCustomerPrefetch(rawPhones);
          for (const p of existing) seenCustomerPhones.add(p);
        }

        for (const item of buffer) {
          const result =
            type === 'leads'
              ? this.validationService.validateLeadRow(item.row, item.rowNum, lookups, {
                  customerByPhone: phoneCache,
                  existingLeadCombos: seenLeadCombos,
                })
              : this.validationService.validateCustomerRow(
                  item.row,
                  item.rowNum,
                  lookups,
                  seenCustomerPhones,
                );

          if (!result.valid) {
            errorCount++;
            errors.push({ row: item.rowNum, originalRow: item.row, message: result.error });
            if (dryRun) pushPreview(item, 'error', result.error);
            continue;
          }

          // Đánh dấu đã thấy -> dòng sau trong cùng file trùng sẽ bị bắt ngay.
          if (type === 'leads') {
            const p = result.parsed as ParsedLead;
            seenLeadCombos.add(leadComboKey(p.phone, p.groupId, p.productId));
          } else {
            seenCustomerPhones.add((result.parsed as ParsedCustomer).phone);
          }

          if (dryRun) {
            successCount++;
            if (result.warnings.length > 0) {
              warningCount++;
              warnings.push({ row: item.rowNum, originalRow: item.row, messages: result.warnings });
              pushPreview(item, 'warning', result.warnings.join(' | '));
            } else {
              pushPreview(item, 'ok', '');
            }
            continue;
          }

          // Real insert path (vẫn per-row - ngoài phạm vi tối ưu lần này).
          try {
            const insertWarnings =
              type === 'leads'
                ? await this.validationService.insertLead(result.parsed as ParsedLead, phoneCache, createdBy)
                : await this.validationService.insertCustomer(result.parsed as ParsedCustomer, createdBy);
            successCount++;
            if (insertWarnings.length > 0) {
              warnings.push({ row: item.rowNum, originalRow: item.row, messages: insertWarnings });
            }
          } catch (e: unknown) {
            errorCount++;
            const message = e instanceof Error ? e.message : String(e);
            errors.push({ row: item.rowNum, originalRow: item.row, message });
          }
        }

        buffer = [];
        if (!dryRun) {
          await this.prisma.importJob.update({
            where: { id: jobId },
            data: { totalRows, successCount, errorCount },
          });
        }
      };

      // Auto-detect encoding (UTF-8 / UTF-16 / Windows-1258) and delimiter so users
      // can upload Excel-saved CSVs without manual re-encoding. 10MB cap upstream.
      const buf = await fs.promises.readFile(absolutePath);
      const { text, delimiter } = decodeBufferAuto(buf);
      const parser = Readable.from(text).pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter }),
      );

      let rowIndex = 0;
      for await (const row of parser) {
        rowIndex++;
        totalRows++;

        if (originalHeaders.length === 0) {
          originalHeaders = Object.keys(row);
          // Header sanity check - if Excel saved as ANSI on a VN locale, diacritics
          // get replaced with '?' and "Số điện thoại" becomes unreadable. Fail fast.
          const hasPhone = 'phone' in row || 'Số điện thoại' in row;
          if (!hasPhone) {
            const guidance =
              `Không nhận diện được cột "Số điện thoại". ` +
              `Header đọc được: [${originalHeaders.join(', ')}]. ` +
              `Hãy lưu lại file bằng "CSV UTF-8 (Comma delimited)" trong Excel rồi thử lại.`;
            errors.push({ row: rowIndex + 1, originalRow: row, message: guidance });
            errorCount++;
            if (dryRun) pushPreview({ row, rowNum: rowIndex + 1 }, 'error', guidance);
            break;
          }
        }

        buffer.push({ row, rowNum: rowIndex + 1 });
        if (buffer.length >= CHUNK_SIZE) await flushBuffer();
      }
      await flushBuffer();

      if (dryRun) {
        // Tạo sẵn file lỗi/cảnh báo ở bước xem trước để nút "tải file đầy đủ" dùng được.
        const errorFileUrl = await this.writeIssuesFile(
          importJobId,
          originalHeaders,
          errors,
          warnings,
        );
        await this.finalizeDryRun(jobId, {
          totalRows,
          validRows: successCount,
          warningRows: warningCount,
          errorRows: errorCount,
          headers: originalHeaders,
          previewRows,
          errorFileUrl,
        });
      } else {
        const errorFileUrl = await this.writeIssuesFile(
          importJobId,
          originalHeaders,
          errors,
          warnings,
        );
        await this.prisma.importJob.update({
          where: { id: jobId },
          data: {
            status: ImportStatus.COMPLETED,
            totalRows,
            successCount,
            errorCount,
            errorFileUrl,
            completedAt: new Date(),
          },
        });
      }
    } catch (e: any) {
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: ImportStatus.FAILED, completedAt: new Date() },
      });
      throw e;
    }
  }

  private async preloadLookups(): Promise<LookupMaps> {
    const [allGroups, allProducts, allLabels] = await Promise.all([
      this.prisma.leadGroup.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sourceId: true,
          skipPool: true,
          source: { select: { skipPool: true } },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      this.prisma.label.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    // Tên nhóm có thể trùng giữa các Nguồn -> giữ match đầu tiên (orderBy id asc).
    const groupMap = new Map<string, { id: bigint; name: string; sourceId: bigint; skipPool: boolean }>();
    for (const g of allGroups) {
      const key = g.name.toLowerCase();
      if (!groupMap.has(key)) {
        // skipPool hiệu lực: Nhóm ưu tiên (g.skipPool), null = kế thừa Nguồn cha.
        groupMap.set(key, {
          id: g.id,
          name: g.name,
          sourceId: g.sourceId,
          skipPool: g.skipPool ?? g.source.skipPool,
        });
      }
    }
    return {
      groupMap,
      productMap: new Map(allProducts.map((p) => [p.name.toLowerCase(), p])),
      labelMap: new Map(allLabels.map((l) => [l.name.toLowerCase(), l])),
    };
  }

  private async finalizeDryRun(
    jobId: bigint,
    data: {
      totalRows: number;
      validRows: number;
      warningRows: number;
      errorRows: number;
      headers: string[];
      previewRows: PreviewRow[];
      errorFileUrl: string | null;
    },
  ) {
    const { totalRows, validRows, warningRows, errorRows, headers, previewRows } = data;
    const previewSummary = {
      totalRows,
      validRows, // tổng dòng sẽ import (gồm cả dòng cảnh báo)
      warningRows, // dòng import được nhưng có cảnh báo (vàng)
      errorRows, // dòng bị loại (đỏ)
      headers, // tên cột gốc để vẽ header bảng
      rows: previewRows, // tối đa PREVIEW_ROW_LIMIT dòng (đủ loại) để vẽ bảng
      previewLimited: previewRows.length < totalRows, // còn dòng chưa hiển thị -> gợi ý tải file
    };
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: ImportStatus.REVIEWED,
        totalRows,
        successCount: validRows,
        errorCount: errorRows,
        errorFileUrl: data.errorFileUrl,
        previewSummary: previewSummary as unknown as Prisma.InputJsonValue,
        reviewedAt: new Date(),
      },
    });
  }

  private async writeIssuesFile(
    importJobId: string,
    originalHeaders: string[],
    errors: { row: number; originalRow: Record<string, string>; message: string }[],
    warnings: { row: number; originalRow: Record<string, string>; messages: string[] }[],
  ): Promise<string | null> {
    const hasIssues = errors.length > 0 || warnings.length > 0;
    if (!hasIssues || originalHeaders.length === 0) return null;

    const headerRow = [...originalHeaders, 'Dòng', 'Loại', 'Thông điệp'];
    const errorRows = errors.map((e) => {
      const cells = originalHeaders.map((h) => escapeCsvCell(e.originalRow[h] ?? ''));
      cells.push(escapeCsvCell(String(e.row)));
      cells.push(escapeCsvCell('Lỗi'));
      cells.push(escapeCsvCell(e.message));
      return cells.join(',');
    });
    const warningRows = warnings.map((w) => {
      const cells = originalHeaders.map((h) => escapeCsvCell(w.originalRow[h] ?? ''));
      cells.push(escapeCsvCell(String(w.row)));
      cells.push(escapeCsvCell('Cảnh báo'));
      cells.push(escapeCsvCell(w.messages.join(' | ')));
      return cells.join(',');
    });
    const dataRows = [...errorRows, ...warningRows];
    // UTF-8 BOM so Excel renders Vietnamese diacritics correctly
    const bom = '﻿';
    const errorCsv = bom + headerRow.map(escapeCsvCell).join(',') + '\n' + dataRows.join('\n');
    const errorDir = path.join(this.uploadDir, 'imports', 'errors');
    fs.mkdirSync(errorDir, { recursive: true });
    const errorFile = `error-${importJobId}.csv`;
    fs.writeFileSync(path.join(errorDir, errorFile), errorCsv);
    return `imports/errors/${errorFile}`;
  }
}
