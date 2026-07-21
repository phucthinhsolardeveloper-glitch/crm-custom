import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import * as ExcelJS from 'exceljs';
import { decodeBufferAuto } from '../import/csv-detect';

// Maps mọi biến thể tên cột (tiếng Việt sao kê ngân hàng + cũ + EN) về field nội bộ.
// Ưu tiên đúng tên cột file Excel xuất ra từ ngân hàng (Số giao dịch / Thu / Chi /
// Số tài khoản đối ứng / Tên tài khoản đối ứng), vẫn giữ alias cũ cho file CSV cũ.
export const HEADER_MAP: Record<string, string> = {
  // Mã giao dịch
  'số giao dịch': 'externalId',
  'mã giao dịch': 'externalId',
  'external id': 'externalId',
  'externalid': 'externalId',
  // Số tiền: ngân hàng tách 2 cột Thu (tiền vào) / Chi (tiền ra)
  'thu': 'thu',
  'chi': 'chi',
  'số tiền': 'amount',
  'amount': 'amount',
  // Nội dung
  'nội dung': 'content',
  'nội dung giao dịch': 'content',
  'content': 'content',
  // Thời gian
  'thời gian': 'transactionTime',
  'thời gian giao dịch': 'transactionTime',
  'ngày giao dịch': 'transactionTime',
  'transaction time': 'transactionTime',
  // Tài khoản nhận (của công ty) - file ngân hàng thường không có cột này
  'tk nhận': 'bankAccount',
  'tài khoản nhận': 'bankAccount',
  'ngân hàng': 'bankAccount',
  'bank account': 'bankAccount',
  // Người gửi = tài khoản đối ứng trong sao kê ngân hàng
  'tên tài khoản đối ứng': 'senderName',
  'tên người gửi': 'senderName',
  'người gửi': 'senderName',
  'sender name': 'senderName',
  'số tài khoản đối ứng': 'senderAccount',
  'tài khoản đối ứng': 'senderAccount',
  'tk người gửi': 'senderAccount',
  'tài khoản người gửi': 'senderAccount',
  'sender account': 'senderAccount',
};

export interface RowPayload {
  externalId?: string;
  amount?: string | number;
  thu?: string | number;
  chi?: string | number;
  content?: string;
  transactionTime?: string;
  bankAccount?: string;
  senderName?: string;
  senderAccount?: string;
}

/** 1 dòng dữ liệu đã map cột, kèm số dòng gốc (1-based) để báo lỗi. */
export interface StatementRow {
  rowNum: number;
  raw: RowPayload;
}

/**
 * Đọc file sao kê (CSV hoặc Excel .xlsx) -> danh sách dòng đã map cột.
 * @param headerRow Dòng tiêu đề do người dùng chọn (1-based). Để trống -> tự dò.
 */
export async function parseStatement(
  buffer: Buffer,
  filename: string,
  headerRow?: number,
): Promise<StatementRow[]> {
  const matrix = isExcel(buffer, filename)
    ? await readXlsxToMatrix(buffer)
    : readCsvToMatrix(buffer);

  if (matrix.length === 0) throw new BadRequestException('File rỗng, không có dữ liệu');

  // Xác định dòng tiêu đề: ưu tiên người dùng chọn, nếu không thì tự dò.
  let headerIdx: number;
  if (headerRow && headerRow > 0) {
    headerIdx = headerRow - 1;
    if (headerIdx >= matrix.length) {
      throw new BadRequestException(`Dòng tiêu đề ${headerRow} vượt quá số dòng trong file (${matrix.length})`);
    }
  } else {
    headerIdx = findHeaderRow(matrix);
    if (headerIdx === -1) {
      throw new BadRequestException(
        'Không tự tìm được dòng tiêu đề. Hãy nhập "Dòng tiêu đề" hoặc kiểm tra các cột: Số giao dịch, Thời gian, Nội dung, Thu...',
      );
    }
  }

  const fieldByCol = matrix[headerIdx].map((h) => HEADER_MAP[normalizeHeader(h)] ?? null);
  if (!fieldByCol.some(Boolean)) {
    throw new BadRequestException(
      `Dòng tiêu đề (${headerIdx + 1}) không có cột nào khớp. Cần tối thiểu các cột như Số giao dịch / Nội dung / Thu.`,
    );
  }

  const rows: StatementRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r];
    const raw: Record<string, string> = {};
    fieldByCol.forEach((field, idx) => {
      const val = cells[idx];
      if (field && val !== undefined && val !== '') raw[field] = val;
    });
    if (isEmptyRow(raw)) continue;
    rows.push({ rowNum: r + 1, raw: raw as RowPayload });
  }
  return rows;
}

/** File Excel khi đuôi .xlsx/.xls hoặc magic bytes ZIP (PK\x03\x04). */
function isExcel(buffer: Buffer, filename: string): boolean {
  if (/\.xlsx?$/i.test(filename)) return true;
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK'
}

/** Đọc CSV thành matrix - GIỮ dòng trống để số dòng khớp với file gốc. */
function readCsvToMatrix(buffer: Buffer): string[][] {
  const { text, delimiter } = decodeBufferAuto(buffer);
  try {
    return parse(text, {
      columns: false,
      skip_empty_lines: false,
      trim: true,
      relax_column_count: true,
      delimiter,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Không đọc được file CSV';
    throw new BadRequestException(`CSV không hợp lệ: ${msg}`);
  }
}

/** Đọc sheet đầu tiên của file .xlsx thành matrix - giữ nguyên thứ tự + dòng trống. */
async function readXlsxToMatrix(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // Cast: Node Buffer vs exceljs Buffer typedef lệch nhau (giống payment-import).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new BadRequestException('Không đọc được file Excel (.xlsx). File có thể hỏng hoặc sai định dạng.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('File Excel không có sheet dữ liệu');

  const matrix: string[][] = [];
  const colCount = sheet.columnCount;
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      cells.push(cellToString(row.getCell(c).value));
    }
    matrix.push(cells);
  }
  return matrix;
}

/** Chuyển 1 ô Excel về chuỗi: xử lý Date, số, rich text, công thức, hyperlink. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // exceljs đọc datetime theo UTC -> dựng lại "YYYY-MM-DD HH:mm:ss" theo đúng giờ hiển thị.
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}`;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text; // hyperlink / rich text gộp
    if (Array.isArray(o.richText)) return o.richText.map((t: { text?: string }) => t.text ?? '').join('');
    if (o.result !== undefined) return String(o.result); // ô công thức
    return '';
  }
  return String(v);
}

/** Chuẩn hoá tên cột: bỏ khoảng trắng thừa, về chữ thường để so khớp HEADER_MAP. */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Dò dòng tiêu đề: dòng đầu tiên (trong 20 dòng đầu) khớp >= 2 tên cột đã biết. */
function findHeaderRow(matrix: string[][]): number {
  const limit = Math.min(matrix.length, 20);
  for (let i = 0; i < limit; i++) {
    const matched = matrix[i].filter((c) => HEADER_MAP[normalizeHeader(c)]).length;
    if (matched >= 2) return i;
  }
  return -1;
}

/** Dòng coi là rỗng khi không có mã GD, nội dung lẫn số tiền nào. */
function isEmptyRow(raw: RowPayload): boolean {
  return (
    !normalizeText(raw.externalId) &&
    !normalizeText(raw.content) &&
    !normalizeText(raw.thu) &&
    !normalizeText(raw.chi) &&
    !normalizeText(raw.amount)
  );
}

/** Trim + trả undefined nếu rỗng. Dùng chung cho reader lẫn service. */
export function normalizeText(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}
