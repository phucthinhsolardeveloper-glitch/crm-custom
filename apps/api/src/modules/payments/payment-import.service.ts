import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import * as ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { decodeBufferAuto } from '../import/csv-detect';
import { PaymentMatchingService } from './payment-matching.service';
import { LarkSyncService } from '../lark-sync/lark-sync.service';

// Column header → field name mapping (Vietnamese headers)
const HEADER_MAP: Record<string, string> = {
  'sđt': 'phone',
  'số điện thoại': 'phone',
  'tên khách hàng': 'customerName',
  'tên kh': 'customerName',
  'sản phẩm': 'productName',
  'sp': 'productName',
  'số tiền': 'amount',
  'doanh thu về cty': 'amount', // tên khớp cột bảng (giữ 'số tiền' cho file cũ)
  'ngày ck': 'transferDate',
  'nội dung ck': 'transferContent',
  'hình thức ck': 'paymentTypeName',
  'loại ck': 'paymentTypeName',
  'lần ck': 'installmentName',
  'đợt tt': 'installmentName', // tên khớp cột bảng
  'ngân hàng': 'bankAccountName',
  'user': 'userEmail',
  'email': 'userEmail',
  'người tạo': 'creatorName',
  'nguoi tao': 'creatorName',
  'nhân viên': 'creatorName', // tên khớp cột bảng (cột bảng hiển thị tên NV)
  'nhan vien': 'creatorName',
  'nguồn': 'sourceName',
  'nguon': 'sourceName',
  'nhóm nguồn': 'groupName',
  'nhom nguon': 'groupName',
  'tên công ty': 'companyName',
  'tên cty': 'companyName', // tên khớp cột bảng
  'mst': 'taxCode',
  'người liên hệ': 'contactPerson',
  'địa chỉ': 'address',
  'mail vat': 'vatEmail',
  'email vat': 'vatEmail',
  'hình thức': 'orderFormatName',
  'nhóm sp': 'productGroupName',
  'nhóm sản phẩm': 'productGroupName',
  'stt': 'stt',
  'mã khoá': 'courseCode',
  'mã khóa': 'courseCode',
  'ghi chú': 'notes',
  'bảng lark': 'larkChannelName',
  'kênh lark': 'larkChannelName',
};

export interface ImportRowResult {
  row: number;
  phone: string;
  reason: string;
}

export interface ImportResult {
  total: number;
  created: number;
  matched: number;
  newCustomers: number;
  newOrders: number;
  /** Số dòng hợp lệ khi chạy thử (dryRun) - sẽ được tạo nếu xác nhận. */
  valid: number;
  /** true = chạy thử (validate, không ghi DB); false = ghi thật. */
  dryRun: boolean;
  /** Id đợt import đã lưu vào lịch sử (chỉ có khi ghi thật). */
  batchId?: string;
  errors: ImportRowResult[];
}

interface RowData {
  phone: string;
  customerName: string;
  productName: string;
  amount: number;
  transferDate?: Date;
  transferContent?: string;
  paymentTypeName?: string;
  bankAccountName?: string;
  installmentName?: string;
  userEmail?: string;
  creatorName?: string;
  sourceName?: string;
  groupName?: string;
  companyName?: string;
  taxCode?: string;
  contactPerson?: string;
  address?: string;
  vatEmail?: string;
  orderFormatName?: string;
  productGroupName?: string;
  stt?: string;
  courseCode?: string;
  notes?: string;
  larkChannelName?: string;
}

@Injectable()
export class PaymentImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matchingService: PaymentMatchingService,
    private readonly larkSync: LarkSyncService,
  ) {}

  async importFromExcel(buffer: Buffer, uploaderId: bigint, dryRun = false, fileName = ''): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    // Cast needed: Node 22 Buffer<ArrayBufferLike> vs exceljs's Buffer typedef mismatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('File Excel không có dữ liệu');

    // Parse headers from row 1
    const headerRow = sheet.getRow(1);
    const colMap: Record<number, string> = {};
    headerRow.eachCell((cell, colNum) => {
      const raw = this._cellToString(cell.value).trim().toLowerCase();
      const field = HEADER_MAP[raw];
      if (field) colMap[colNum] = field;
    });

    const rows: { rowNum: number; data: RowData }[] = [];

    // Parse all data rows (skip header row 1)
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header

      // Check if row is empty
      let hasData = false;
      row.eachCell((cell) => {
        if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
          hasData = true;
        }
      });
      if (!hasData) return;

      const rowData: Partial<RowData> = {};
      row.eachCell((cell, colNum) => {
        const field = colMap[colNum];
        if (!field) return;
        const val = cell.value;
        if (val === null || val === undefined) return;

        if (field === 'transferDate') {
          const parsed = this._toDate(val);
          if (parsed) rowData.transferDate = parsed;
        } else if (field === 'amount') {
          const num = typeof val === 'number' ? val : parseFloat(this._cellToString(val).replace(/[^\d.-]/g, ''));
          if (!isNaN(num)) rowData.amount = num;
        } else {
          const text = this._cellToString(val).trim();
          if (text !== '') (rowData as any)[field] = text;
        }
      });

      rows.push({ rowNum, data: rowData as RowData });
    });

    return this._runImport(rows, uploaderId, dryRun, fileName);
  }

  /**
   * Import orders + payments from a CSV file (Vietnamese headers, same columns as
   * the Excel template). Reuses the exact per-row logic so both formats behave
   * identically. Handles Excel-saved CSV quirks (charset + delimiter) via
   * decodeBufferAuto so users upload whatever Excel produced without re-saving.
   */
  async importFromCsv(buffer: Buffer, uploaderId: bigint, dryRun = false, fileName = ''): Promise<ImportResult> {
    const { text, delimiter } = decodeBufferAuto(buffer);

    let records: Record<string, string>[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter,
        relax_column_count: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'không đọc được nội dung';
      throw new BadRequestException(`File CSV không hợp lệ: ${msg}`);
    }

    if (records.length === 0) throw new BadRequestException('File CSV không có dữ liệu');

    // rowNum = index + 2 (row 1 is the header, data starts at spreadsheet row 2)
    const rows = records.map((rec, i) => ({ rowNum: i + 2, data: this._mapCsvRecord(rec) }));
    return this._runImport(rows, uploaderId, dryRun, fileName);
  }

  /** Map one CSV record (raw header → cell) into a typed RowData via HEADER_MAP. */
  private _mapCsvRecord(rec: Record<string, string>): RowData {
    const data: Partial<RowData> = {};
    for (const [rawKey, rawVal] of Object.entries(rec)) {
      const field = HEADER_MAP[rawKey.trim().toLowerCase()];
      if (!field) continue;
      const val = rawVal == null ? '' : String(rawVal).trim();
      if (val === '') continue;

      if (field === 'transferDate') {
        const parsed = this._toDate(val);
        if (parsed) data.transferDate = parsed;
      } else if (field === 'amount') {
        const num = parseFloat(val.replace(/[^\d.-]/g, ''));
        if (!isNaN(num)) data.amount = num;
      } else {
        (data as Record<string, unknown>)[field] = val;
      }
    }
    return data as RowData;
  }

  /**
   * Flatten an ExcelJS cell value into a plain string. ExcelJS returns objects for
   * rich text (mixed fonts within one cell, common after copy-paste), hyperlinks, and
   * formula cells. A bare String() on those yields "[object Object]", which then fails
   * every name lookup. Handle each shape so a cell reads the same whether its text is
   * plain or formatted.
   */
  private _cellToString(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (val instanceof Date) return val.toISOString();

    const obj = val as Record<string, unknown>;
    // Rich text: concat every run's text (mixed fonts within one cell).
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    }
    // Hyperlink cell: { text, hyperlink } -> use the visible text.
    if (typeof obj.text === 'string') return obj.text;
    // Formula cell: { formula, result } -> use the computed result.
    if ('result' in obj) return this._cellToString(obj.result);

    return String(val);
  }

  /**
   * Convert a raw date cell (real Date, Excel serial number, or a date string) into a
   * Date, or undefined when empty/unparseable/out of a realistic range. Excel stores
   * dates as a day count (serial) and CSV export can emit that bare number; parsing it
   * as a plain string makes JS read it as a far-future YEAR the DB then rejects. So
   * numeric cells are converted from the Excel epoch, and every result is range-checked.
   */
  private _toDate(val: unknown): Date | undefined {
    if (val === null || val === undefined) return undefined;
    if (val instanceof Date) return this._inRange(val);

    const s = String(val).trim();
    if (s === '') return undefined;

    // Excel serial day count (e.g. 46203 = 30/06/2026). Bare integers/decimals only.
    // 25569 = days between the Excel epoch (1899-12-30) and the Unix epoch (1970-01-01).
    if (/^\d+(\.\d+)?$/.test(s)) {
      return this._inRange(new Date(Math.round((Number(s) - 25569) * 86400000)));
    }

    // DD/MM/YYYY or DD-MM-YYYY (Vietnamese format) before native parsing. UTC midnight
    // keeps the calendar day stable regardless of the server timezone.
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return this._inRange(new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))));

    return this._inRange(new Date(s));
  }

  /** Accept only dates in a realistic business range; reject NaN and absurd years. */
  private _inRange(d: Date): Date | undefined {
    if (isNaN(d.getTime())) return undefined;
    const y = d.getUTCFullYear();
    return y >= 2000 && y <= 2100 ? d : undefined;
  }

  /** Preload lookup tables, then process every parsed row (shared by Excel + CSV). */
  private async _runImport(
    rows: { rowNum: number; data: RowData }[],
    uploaderId: bigint,
    dryRun: boolean,
    fileName: string,
  ): Promise<ImportResult> {
    const [paymentTypes, installments, orderFormats, productGroups, larkMappings, bankAccounts, leadSources, leadGroups] = await Promise.all([
      this.prisma.paymentType.findMany({ select: { id: true, name: true } }),
      this.prisma.paymentInstallment.findMany({ select: { id: true, name: true } }),
      this.prisma.orderFormat.findMany({ select: { id: true, name: true } }),
      this.prisma.productGroup.findMany({ select: { id: true, name: true } }),
      this.prisma.larkSyncMapping.findMany({ where: { enabled: true }, select: { id: true, name: true } }),
      this.prisma.bankAccount.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      // Nguồn 2 cấp: cột "Nguồn" resolve theo Nguồn cha (lead_sources), cột "Nhóm nguồn"
      // resolve theo Nhóm con (lead_groups) và phải thuộc đúng Nguồn cha đã chọn.
      this.prisma.leadSource.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.prisma.leadGroup.findMany({ where: { isActive: true }, select: { id: true, name: true, sourceId: true } }),
    ]);

    const result: ImportResult = {
      total: rows.length, created: 0, matched: 0, newCustomers: 0, newOrders: 0, valid: 0, dryRun, errors: [],
    };

    // Ghi thật -> tạo bản ghi lịch sử TRƯỚC để payment từng dòng gắn được batchId.
    // dryRun không lưu lịch sử (chỉ validate, không ghi gì).
    let batchId: bigint | undefined;
    if (!dryRun) {
      const batch = await this.prisma.paymentImportBatch.create({
        data: { fileName: fileName || 'không rõ tên file', totalRows: rows.length, createdBy: uploaderId },
        select: { id: true },
      });
      batchId = batch.id;
      result.batchId = batch.id.toString();
    }

    for (const { rowNum, data } of rows) {
      try {
        await this._processRow(data, rowNum, uploaderId, paymentTypes, installments, orderFormats, productGroups, larkMappings, bankAccounts, leadSources, leadGroups, result, dryRun, batchId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
        result.errors.push({ row: rowNum, phone: data.phone ?? '', reason: msg });
      }
    }

    // Chốt số liệu tổng hợp + danh sách lỗi vào lịch sử sau khi chạy xong toàn bộ.
    if (batchId) {
      await this.prisma.paymentImportBatch.update({
        where: { id: batchId },
        data: {
          createdCount: result.created,
          newOrders: result.newOrders,
          newCustomers: result.newCustomers,
          errorCount: result.errors.length,
          errors: result.errors.length ? (result.errors as unknown as object) : undefined,
        },
      });
    }

    return result;
  }

  private async _processRow(
    data: RowData,
    rowNum: number,
    uploaderId: bigint,
    paymentTypes: { id: bigint; name: string }[],
    installments: { id: bigint; name: string }[],
    orderFormats: { id: bigint; name: string }[],
    productGroups: { id: bigint; name: string }[],
    larkMappings: { id: bigint; name: string }[],
    bankAccounts: { id: bigint; name: string }[],
    leadSources: { id: bigint; name: string }[],
    leadGroups: { id: bigint; name: string; sourceId: bigint }[],
    result: ImportResult,
    dryRun: boolean,
    batchId?: bigint,
  ): Promise<void> {
    // Validate required fields. customerName is NOT required: phone is guaranteed to
    // already have a lead, so we derive the name from the lead when the file omits it.
    if (!data.phone) throw new Error('Thiếu SĐT');
    if (!data.productName) throw new Error('Thiếu sản phẩm');
    if (!data.amount || data.amount <= 0) throw new Error('Số tiền không hợp lệ');
    // Nguồn (cấp cha) bắt buộc: resolve theo lead_source. Trống/sai -> báo đỏ.
    if (!data.sourceName) throw new Error('Thiếu nguồn');
    const leadSource = leadSources.find(
      (s) => s.name.toLowerCase().trim() === data.sourceName!.toLowerCase().trim(),
    );
    if (!leadSource) throw new Error(`Không tìm thấy nguồn: "${data.sourceName}"`);

    // Nhóm nguồn (cấp con) tuỳ chọn. Nếu điền: resolve theo lead_group VÀ phải thuộc
    // đúng Nguồn cha ở trên (tránh gán nhầm nhóm của nguồn khác cùng tên).
    let leadGroupId: bigint | null = null;
    if (data.groupName) {
      const group = leadGroups.find(
        (g) => g.name.toLowerCase().trim() === data.groupName!.toLowerCase().trim()
          && g.sourceId === leadSource.id,
      );
      if (!group) throw new Error(`Không tìm thấy nhóm "${data.groupName}" thuộc nguồn "${data.sourceName}"`);
      leadGroupId = group.id;
    }

    // Normalize & validate phone
    const phone = normalizePhone(data.phone);
    if (!phone || !isValidVNPhone(phone)) throw new Error(`SĐT không hợp lệ: ${data.phone}`);

    // Find product (case-insensitive)
    const product = await this.prisma.product.findFirst({
      where: { name: { equals: data.productName, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true, price: true, vatRate: true },
    });
    if (!product) throw new Error(`Không tìm thấy sản phẩm: "${data.productName}"`);

    // Resolve lookup IDs
    const paymentTypeId = data.paymentTypeName
      ? this._findByName(paymentTypes, data.paymentTypeName)
      : undefined;
    const installmentId = data.installmentName
      ? this._findByName(installments, data.installmentName)
      : undefined;
    const orderFormatId = data.orderFormatName
      ? this._findByName(orderFormats, data.orderFormatName)
      : undefined;
    const productGroupId = data.productGroupName
      ? this._findByName(productGroups, data.productGroupName)
      : undefined;
    // Ngân hàng: có giá trị nhưng sai tên -> báo đỏ (nhất quán với các lookup có tên trong file).
    let bankAccountId: bigint | undefined;
    if (data.bankAccountName) {
      bankAccountId = this._findByName(bankAccounts, data.bankAccountName);
      if (!bankAccountId) throw new Error(`Không tìm thấy ngân hàng: "${data.bankAccountName}"`);
    }

    // Bảng Lark đích: tên phải khớp đường ống enabled - sai tên báo lỗi ngay (thay vì
    // im lặng bỏ qua rồi payment không bao giờ đổ về Lark). Bỏ trống = không sync.
    let larkSyncId: bigint | undefined;
    if (data.larkChannelName) {
      larkSyncId = this._findByName(larkMappings, data.larkChannelName);
      if (!larkSyncId) throw new Error(`Không tìm thấy bảng Lark: "${data.larkChannelName}"`);
    }

    // Resolve creator: prefer email (exact), else the "Người tạo" name column.
    // Bỏ trống cả 2 -> fallback người upload (không báo lỗi). CÓ giá trị nhưng không
    // tìm ra / trùng nhiều -> báo đỏ để user sửa (thay vì im lặng gán nhầm người up).
    let creatorId = uploaderId;
    if (data.userEmail) {
      const user = await this.prisma.user.findFirst({
        where: { email: data.userEmail, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new Error(`Không tìm thấy nhân viên (email): "${data.userEmail}"`);
      creatorId = user.id;
    } else if (data.creatorName) {
      const matches = await this.prisma.user.findMany({
        where: { name: { equals: data.creatorName, mode: 'insensitive' }, deletedAt: null },
        select: { id: true },
        take: 2,
      });
      if (matches.length === 0) throw new Error(`Không tìm thấy nhân viên: "${data.creatorName}"`);
      if (matches.length > 1) throw new Error(`Tên nhân viên trùng nhiều người: "${data.creatorName}" - dùng cột User (email)`);
      creatorId = matches[0].id;
    }

    // Dry-run: all validations + product lookup passed above without touching the DB.
    // Count the row as valid and stop before any write.
    if (dryRun) {
      result.valid++;
      return;
    }

    // Execute within transaction: find/create customer, find/create order, create payment
    const { paymentId, wasNewCustomer, wasNewOrder } = await this.prisma.$transaction(async (tx) => {
      // a. Resolve lead theo SĐT + ĐÚNG NGUỒN trong file. 1 SĐT có thể có nhiều lead ở
      // các nguồn khác nhau -> đơn phải nối lead CÙNG NGUỒN thì /orders mới hiện đúng
      // Nguồn/Nhóm. Không có lead cùng nguồn -> nhận lead chưa phân nguồn, hoặc tạo mới.
      let lead = await tx.lead.findFirst({
        where: { phone, deletedAt: null, sourceId: leadSource.id },
        orderBy: { id: 'desc' },
        select: { id: true, customerId: true, name: true, groupId: true },
      });

      // Lead cùng nguồn có sẵn nhưng thiếu nhóm + file điền nhóm -> bổ sung (không đè nhóm cũ).
      if (lead && leadGroupId && lead.groupId == null) {
        await tx.lead.update({ where: { id: lead.id }, data: { groupId: leadGroupId } });
      }

      // Không có lead cùng nguồn -> nhận lead CHƯA có nguồn (sourceId null) theo SĐT rồi
      // gắn nguồn/nhóm từ file. Lead "chưa phân nguồn" an toàn để nhận (không lệch nguồn cũ).
      if (!lead) {
        const unsourced = await tx.lead.findFirst({
          where: { phone, deletedAt: null, sourceId: null },
          orderBy: { id: 'desc' },
          select: { id: true, customerId: true, name: true },
        });
        if (unsourced) {
          await tx.lead.update({
            where: { id: unsourced.id },
            data: { sourceId: leadSource.id, groupId: leadGroupId },
          });
          lead = { ...unsourced, groupId: leadGroupId };
        }
      }

      // b. Find or create customer
      let customer = await tx.customer.findFirst({
        where: { phone, deletedAt: null },
        select: { id: true },
      });
      let wasNewCustomer = false;

      // Chưa có customer trực tiếp nhưng lead đã trỏ tới 1 customer -> dùng lại.
      if (!customer && lead?.customerId) {
        customer = await tx.customer.findFirst({
          where: { id: lead.customerId, deletedAt: null },
          select: { id: true },
        });
      }

      // Customer/order name: file value → lead name → phone as last-resort placeholder
      const resolvedName = data.customerName || lead?.name || phone;

      if (!customer) {
        customer = await tx.customer.create({
          data: { phone, name: resolvedName },
          select: { id: true },
        });
        wasNewCustomer = true;
      }

      // c. Chưa có lead nào theo SĐT -> tạo lead mới đầy đủ nguồn/nhóm/sản phẩm/khách.
      // Đơn import trước đây mồ côi lead nên /orders trống Nguồn; tạo lead ở đây để
      // mọi đơn import đều nối được lead và hiện đúng Nguồn/Nhóm lấy từ file.
      if (!lead) {
        lead = await tx.lead.create({
          data: {
            phone,
            name: resolvedName,
            customerId: customer.id,
            productId: product.id,
            sourceId: leadSource.id,
            groupId: leadGroupId,
            assignedUserId: creatorId,
            status: 'CONVERTED',
          },
          select: { id: true, customerId: true, name: true, groupId: true },
        });
      } else if (lead.customerId == null) {
        // Lead cũ chưa gắn customer -> gắn để liên kết order/lead/customer nhất quán.
        await tx.lead.update({ where: { id: lead.id }, data: { customerId: customer.id } });
      }

      // b. Find or create order
      const existingOrder = await tx.order.findFirst({
        where: {
          customerId: customer.id,
          productId: product.id,
          deletedAt: null,
        },
        orderBy: { id: 'desc' },
        select: { id: true, totalAmount: true, amount: true, larkSyncId: true, leadId: true },
      });

      let orderId: bigint;
      let wasNewOrder = false;
      // Tổng tiền đơn (mẫu số tính tỉ lệ TT) = đơn giá * số lượng. Đơn cũ lấy totalAmount;
      // đơn do import tạo luôn số lượng 1 nên totalAmount = giá SP.
      let orderAmount: number;

      if (existingOrder) {
        orderId = existingOrder.id;
        orderAmount = Number(existingOrder.totalAmount);
        // Đơn cũ chưa chọn bảng Lark + file có chỉ định -> gắn bổ sung để payment
        // lần này (và các lần sau) sync được. KHÔNG đè đường ống đơn đã chọn.
        if (larkSyncId && !existingOrder.larkSyncId) {
          await tx.order.update({ where: { id: orderId }, data: { larkSyncId } });
        }
        // Đơn cũ chưa nối lead -> gắn lead vừa resolve để hiện Nguồn/Nhóm trên /orders.
        if (!existingOrder.leadId) {
          await tx.order.update({ where: { id: orderId }, data: { leadId: lead.id } });
        }
      } else {
        const productPrice = Number(product.price);
        orderAmount = productPrice;
        const vatRate = Number(product.vatRate);
        // Giá SP đã bao gồm VAT -> tách phần VAT nằm trong giá; tổng đúng bằng giá.
        const vatAmount = Math.round((productPrice * vatRate) / (100 + vatRate));
        const totalAmount = productPrice;

        const newOrder = await tx.order.create({
          data: {
            customerId: customer.id,
            leadId: lead.id,
            productId: product.id,
            amount: productPrice,
            vatRate,
            vatAmount,
            totalAmount,
            createdBy: creatorId,
            companyName: data.companyName || null,
            taxCode: data.taxCode || null,
            contactPerson: data.contactPerson || null,
            address: data.address || null,
            vatEmail: data.vatEmail || null,
            formatId: orderFormatId ?? null,
            productGroupId: productGroupId ?? null,
            stt: data.stt || null,
            courseCode: data.courseCode || null,
            larkSyncId: larkSyncId ?? null,
            notes: data.notes || null,
            customerName: resolvedName,
            customerPhone: phone,
          },
          select: { id: true },
        });
        orderId = newOrder.id;
        wasNewOrder = true;
      }

      // c. Create payment (PENDING)
      // Số CK đã bao gồm VAT -> tách phần VAT nằm trong số tiền (giá SP đã gồm VAT).
      const pmtVatRate = Number(product.vatRate);
      const vatAmount = Math.round((data.amount * pmtVatRate) / (100 + pmtVatRate));

      // Tỉ lệ TT: cộng dồn tiền đã thu của đơn (loại REFUNDED + CANCELLED) + lần này,
      // chia cho tổng tiền đơn (orderAmount = totalAmount). Cùng công thức với PaymentsService.create.
      const prevPaid = wasNewOrder
        ? 0
        : Number(
            (await tx.payment.aggregate({
              where: { orderId, status: { notIn: ['REFUNDED', 'CANCELLED'] } },
              _sum: { amount: true },
            }))._sum.amount || 0,
          );
      const completionRate = orderAmount > 0
        ? Math.round(((prevPaid + data.amount) / orderAmount) * 10000) / 100
        : 0;

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: data.amount,
          vatAmount,
          completionRate,
          status: 'PENDING',
          transferContent: data.transferContent || null,
          transferDate: data.transferDate || null,
          paymentTypeId: paymentTypeId ?? null,
          bankAccountId: bankAccountId ?? null,
          installmentId: installmentId ?? null,
          importBatchId: batchId ?? null,
        },
        select: { id: true },
      });

      // d. Ghi activity vào timeline lead (giống flow tạo đơn/payment tay).
      // Trong transaction nên rollback đồng bộ nếu import dòng này lỗi.
      if (wasNewOrder) {
        await tx.activity.create({
          data: {
            entityType: 'LEAD', entityId: lead.id, userId: creatorId,
            type: 'NOTE',
            content: `Import: tạo đơn hàng #${orderId} - ${product.name} - ${orderAmount.toLocaleString('vi-VN')}₫`,
            metadata: { orderId: orderId.toString(), type: 'ORDER_IMPORTED' },
          },
        });
      }
      await tx.activity.create({
        data: {
          entityType: 'LEAD', entityId: lead.id, userId: creatorId,
          type: 'NOTE',
          content: `Import: thanh toán ${data.amount.toLocaleString('vi-VN')}₫ (chờ xác nhận)`,
          metadata: { paymentId: payment.id.toString(), orderId: orderId.toString(), type: 'PAYMENT_IMPORTED' },
        },
      });

      return { paymentId: payment.id, wasNewCustomer, wasNewOrder };
    });

    result.created++;
    if (wasNewCustomer) result.newCustomers++;
    if (wasNewOrder) result.newOrders++;

    // Đổ payment về Lark như flow tạo đơn tay. Best-effort (lỗi enqueue chỉ log);
    // processor tự skip nếu đơn không có larkSyncId.
    void this.larkSync.enqueuePaymentSync(paymentId.toString(), 'create');

    // d. Auto-match ngay khi import payment đã TẮT theo yêu cầu: payment import
    // giữ PENDING chờ duyệt tay (webhook bank / cron fuzzy vẫn khớp sau nếu có).
  }

  /** Danh sách các đợt import, mới nhất trước (cursor pagination theo id). */
  async listBatches(query: { cursor?: string; limit?: number }) {
    const limit = Math.min(query.limit ?? 20, 100);
    const batches = await this.prisma.paymentImportBatch.findMany({
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
      orderBy: { id: 'desc' },
      include: { uploader: { select: { id: true, name: true } } },
    });
    const hasMore = batches.length > limit;
    const data = hasMore ? batches.slice(0, limit) : batches;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id.toString() : undefined } };
  }

  /** Chi tiết 1 đợt: số liệu + lỗi từng dòng + danh sách payment đã tạo trong đợt. */
  async getBatchDetail(id: bigint) {
    const batch = await this.prisma.paymentImportBatch.findUnique({
      where: { id },
      include: { uploader: { select: { id: true, name: true } } },
    });
    if (!batch) throw new BadRequestException('Không tìm thấy đợt import');

    const payments = await this.prisma.payment.findMany({
      where: { importBatchId: id },
      orderBy: { id: 'asc' },
      select: {
        id: true, amount: true, status: true, transferDate: true, createdAt: true,
        order: {
          select: {
            id: true, customerName: true, customerPhone: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    return { ...batch, payments };
  }

  private _findByName(list: { id: bigint; name: string }[], name: string): bigint | undefined {
    const lower = name.toLowerCase().trim();
    const found = list.find((item) => item.name.toLowerCase().trim() === lower);
    return found?.id;
  }

  // generateTemplate chuyển sang PaymentImportTemplateService (file mẫu có dropdown
  // danh mục lấy từ DB). Giữ service này thuần logic import.
}
