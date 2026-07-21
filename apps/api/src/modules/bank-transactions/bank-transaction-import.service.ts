import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { BankTransactionsService } from './bank-transactions.service';
import { parseStatement, normalizeText, type RowPayload } from './bank-statement-reader';
import { vnWallClockToIso } from '../../common/utils/vn-timezone';

// Template tải về dùng đúng tên cột sao kê ngân hàng. Có dòng tiêu đề "phụ" phía trên
// để giống hệt file ngân hàng xuất (parser tự dò đúng dòng header).
const CSV_TITLE = 'Lịch sử giao dịch';
const CSV_HEADERS = [
  'STT',
  'Số giao dịch',
  'Thời gian',
  'Nội dung',
  'Loại tiền',
  'Thu',
  'Chi',
  'Số tài khoản đối ứng',
  'Tên tài khoản đối ứng',
];

export interface ImportRowError {
  row: number;
  externalId?: string;
  reason: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped_duplicate: number;
  skipped_outgoing: number;
  auto_matched: number;
  errors: ImportRowError[];
}

@Injectable()
export class BankTransactionImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bankTxService: BankTransactionsService,
  ) {}

  /**
   * Import sao kê từ file CSV hoặc Excel (.xlsx). Mặc định tự dò dòng tiêu đề
   * (xử lý được file ngân hàng có dòng tên bảng + dòng trống ở trên). headerRow
   * (1-based) chỉ dùng khi muốn ép thủ công - không bắt buộc.
   */
  async importStatement(buffer: Buffer, filename: string, headerRow?: number): Promise<ImportResult> {
    const rows = await parseStatement(buffer, filename, headerRow);

    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    const accountNames = new Set(bankAccounts.map((a) => a.name.toLowerCase()));

    const result: ImportResult = {
      total: 0,
      imported: 0,
      skipped_duplicate: 0,
      skipped_outgoing: 0,
      auto_matched: 0,
      errors: [],
    };

    for (const { rowNum, raw } of rows) {
      // Chỉ đối soát tiền VÀO. Dòng chỉ có "Chi" (tiền ra: chuyển quỹ nội bộ, chi phí...)
      // bỏ qua, không coi là lỗi.
      const incoming = parseVNAmount(raw.thu) || parseVNAmount(raw.amount);
      const outgoing = parseVNAmount(raw.chi);
      if (incoming <= 0 && outgoing > 0) {
        result.skipped_outgoing++;
        continue;
      }

      result.total++;
      try {
        const payload = this.buildPayload(raw, incoming);

        if (payload.bankAccount && accountNames.size > 0 && !accountNames.has(payload.bankAccount.toLowerCase())) {
          throw new Error(`Tên TK "${payload.bankAccount}" không tồn tại trong hệ thống`);
        }

        const ingested = await this.bankTxService.ingest({
          externalId: payload.externalId!,
          amount: payload.amount!,
          content: payload.content!,
          bankAccount: payload.bankAccount,
          senderName: payload.senderName,
          senderAccount: payload.senderAccount,
          transactionTime: payload.transactionTime,
        });

        result.imported++;
        if (ingested?.matchStatus === 'AUTO_MATCHED') result.auto_matched++;
      } catch (err) {
        if (err instanceof ConflictException) {
          result.skipped_duplicate++;
          continue;
        }
        const reason = err instanceof Error ? err.message : 'Lỗi không xác định';
        result.errors.push({ row: rowNum, externalId: raw.externalId, reason });
      }
    }

    return result;
  }

  private buildPayload(
    raw: RowPayload,
    amount: number,
  ): { externalId: string; amount: number; content: string } & RowPayload {
    const content = (raw.content ?? '').toString().trim();
    if (!content) throw new Error('Nội dung giao dịch bắt buộc');

    if (!amount || amount <= 0) throw new Error('Số tiền (cột Thu) phải > 0');

    const transactionTime = parseFlexDate(raw.transactionTime as unknown as string);
    const bankAccount = normalizeText(raw.bankAccount);
    const senderName = normalizeText(raw.senderName);
    const senderAccount = normalizeText(raw.senderAccount);
    const externalIdRaw = normalizeText(raw.externalId);

    const externalId = externalIdRaw
      ? externalIdRaw.replace(/[^\w\-.]/g, '').slice(0, 255)
      : generateExternalId({ transactionTime, amount, content, senderAccount });

    if (!externalId) throw new Error('Không tạo được externalId');

    return { externalId, amount, content, transactionTime, bankAccount, senderName, senderAccount };
  }

  generateTemplate(): Buffer {
    const BOM = '﻿';
    const titleLine = csvEscape(CSV_TITLE);
    const headerLine = CSV_HEADERS.map(csvEscape).join(',');
    // STT, Số GD, Thời gian, Nội dung, Loại tiền, Thu, Chi, STK đối ứng, Tên đối ứng
    const sampleIncoming = ['1', '1000000000001', '2026-06-26 13:18:18', 'Thanh toan don hang 0900000000', 'VND', '999000', '', '10000000000001', 'NGUYEN VAN A'];
    const sampleOutgoing = ['2', '1000000000002', '2026-06-26 10:52:18', 'LUAN CHUYEN QUY NOI BO (chi ra - se bo qua)', 'VND', '', '200000000', '', 'CONG TY DEMO'];
    const lines = [
      titleLine,
      '',
      headerLine,
      sampleIncoming.map(csvEscape).join(','),
      sampleOutgoing.map(csvEscape).join(','),
    ];
    return Buffer.from(BOM + lines.join('\r\n') + '\r\n', 'utf8');
  }
}

function parseVNAmount(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  // Strip non-numeric chars except . , -
  const cleaned = String(raw).replace(/[^\d,.-]/g, '');
  // VN format: 1.000.000,50 | Intl: 1,000,000.50 | plain: 1000000
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Use last separator as decimal
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Ambiguous - treat comma as thousands if >1 comma or group-of-3
    const parts = cleaned.split(',');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  } else if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    // If any non-last group is 3 digits → thousands separator
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
      normalized = cleaned.replace(/\./g, '');
    }
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function parseFlexDate(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  // Already carries an explicit timezone (trailing Z or +/-HH:mm) -> trust it.
  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const direct = new Date(s);
    if (!isNaN(direct.getTime())) return direct.toISOString();
  }

  // yyyy-MM-dd[ or T]HH:mm[:ss] (naive) -> Vietnam local time
  const isoNaive = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (isoNaive) {
    const [, yyyy, mm, dd, hh = '0', mi = '0', ss = '0'] = isoNaive;
    return vnWallClockToIso(+yyyy, +mm, +dd, +hh, +mi, +ss);
  }

  // dd/MM/yyyy[ HH:mm[:ss]] (naive) -> Vietnam local time
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = dmy;
    return vnWallClockToIso(+yyyy, +mm, +dd, +hh, +mi, +ss);
  }

  // Last resort: native parse (may be tz-sensitive but better than dropping).
  const direct = new Date(s);
  return isNaN(direct.getTime()) ? undefined : direct.toISOString();
}

function generateExternalId(parts: {
  transactionTime?: string;
  amount: number;
  content: string;
  senderAccount?: string;
}): string {
  const seed = `${parts.transactionTime ?? ''}|${parts.amount}|${parts.content}|${parts.senderAccount ?? ''}`;
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 32);
  return `csv-${hash}`;
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
