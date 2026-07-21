import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';

/**
 * Sinh file Excel mau cho import don hang/payment (GET /payments/import-template).
 *
 * Diem chinh: cac cot danh muc (San pham, Nguon, Hinh thuc CK...) duoc gan
 * dropdown (Excel data validation) lay du lieu THAT tu DB tai thoi diem tai file,
 * de nguoi dung chon thay vi go tay sai chinh ta. Danh sach nam o sheet an
 * "DanhSach"; dropdown o che do canh bao (warning) nen van cho phep go gia tri
 * ngoai danh sach - import se validate lai lan cuoi.
 */

/** So dong du lieu duoc gan san dropdown (tu dong 2). */
const DROPDOWN_ROWS = 1000;

/** Ten cac danh muc co dropdown - khop ten field tra ve tu _loadLists. */
type ListKey =
  | 'users' | 'sources' | 'groups' | 'products' | 'productGroups'
  | 'orderFormats' | 'installments' | 'paymentTypes' | 'banks' | 'larkChannels';

interface TemplateColumn {
  header: string;
  width: number;
  /** Gia tri o dong vi du (dong 2). */
  sample: string | number | Date;
  /** Co gia tri -> cot nay duoc gan dropdown tu danh muc tuong ung. */
  listKey?: ListKey;
}

// Cot xep theo DUNG thu tu + ten cot tren bang /orders (chi giu cot nhap tay duoc).
// Bo cac cot he thong tu tinh hoac khoa: Ma don, Team, Gia niem yet, VAT %, Tien VAT,
// DT thuan, Ti le TT, Trang thai, KT xac nhan.
// "Nguon" BAT BUOC: ten khop 1 Nguon (lead_source) cap cha. "Nhom nguon" TUY CHON:
// ten khop Nhom con thuoc dung Nguon cha (KHAC "Nhom SP" = nhom san pham).
// "Nguoi lien he" + "Bang Lark" khong co tren bang nhung can cho import (dat cuoi).
const COLUMNS: TemplateColumn[] = [
  { header: 'Tên khách hàng', width: 20, sample: 'Nguyễn Văn A' },
  { header: 'SĐT', width: 15, sample: '0912345678' },
  // Import so khop "Nhan vien" theo TEN nhan vien (trung ten -> bao loi, doi sang email).
  { header: 'Nhân viên', width: 25, sample: '', listKey: 'users' },
  { header: 'Nguồn', width: 15, sample: '', listKey: 'sources' },
  // Dropdown chi chua ten nhom thuan (khong kem ten nguon cha) vi import match theo
  // dung ten nhom; quan he nhom-thuoc-nguon duoc validate lai luc import.
  { header: 'Nhóm nguồn', width: 18, sample: '', listKey: 'groups' },
  { header: 'Sản phẩm', width: 25, sample: '', listKey: 'products' },
  { header: 'Nhóm SP', width: 15, sample: '', listKey: 'productGroups' },
  { header: 'Hình thức', width: 15, sample: '', listKey: 'orderFormats' },
  { header: 'Đợt TT', width: 12, sample: '', listKey: 'installments' },
  { header: 'Doanh thu về cty', width: 16, sample: 5000000 },
  { header: 'Ngày CK', width: 12, sample: new Date() },
  { header: 'Hình thức CK', width: 15, sample: '', listKey: 'paymentTypes' },
  { header: 'Ngân hàng', width: 18, sample: '', listKey: 'banks' },
  { header: 'Nội dung CK', width: 25, sample: 'CK tháng 4' },
  { header: 'Ghi chú', width: 20, sample: '' },
  { header: 'Tên CTY', width: 20, sample: '' },
  { header: 'MST', width: 15, sample: '' },
  { header: 'Email VAT', width: 25, sample: '' },
  { header: 'Địa chỉ', width: 25, sample: '' },
  { header: 'Người liên hệ', width: 20, sample: '' },
  { header: 'STT', width: 10, sample: '' },
  { header: 'Mã khoá', width: 15, sample: '' },
  { header: 'Bảng Lark', width: 18, sample: '', listKey: 'larkChannels' },
];

@Injectable()
export class PaymentImportTemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  async generateTemplate(): Promise<Buffer> {
    const lists = await this._loadLists();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mẫu nhập payment');

    sheet.addRow(COLUMNS.map((c) => c.header));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.addRow(COLUMNS.map((c) => c.sample));

    COLUMNS.forEach((col, i) => {
      sheet.getColumn(i + 1).width = col.width;
    });

    // Format cot "Doanh thu ve cty" dang so tien.
    const amountCol = COLUMNS.findIndex((c) => c.header === 'Doanh thu về cty') + 1;
    sheet.getColumn(amountCol).numFmt = '#,##0';

    this._attachDropdowns(workbook, sheet, lists);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Doc cac danh muc dang hoat dong tu DB - dung DUNG dieu kien loc ma
   * payment-import.service dung khi resolve ten, de dropdown va import khop nhau.
   */
  private async _loadLists(): Promise<Record<ListKey, string[]>> {
    const [users, sources, groups, products, productGroups, orderFormats, installments, paymentTypes, banks, larkChannels] =
      await Promise.all([
        this.prisma.user.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.leadSource.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.leadGroup.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.product.findMany({ where: { deletedAt: null }, select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.productGroup.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.orderFormat.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.paymentInstallment.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.paymentType.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.bankAccount.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
        this.prisma.larkSyncMapping.findMany({ where: { enabled: true }, select: { name: true }, orderBy: { name: 'asc' } }),
      ]);

    const names = (rows: { name: string }[]) => rows.map((r) => r.name.trim()).filter((n) => n !== '');
    return {
      users: names(users),
      sources: names(sources),
      groups: names(groups),
      products: names(products),
      productGroups: names(productGroups),
      orderFormats: names(orderFormats),
      installments: names(installments),
      paymentTypes: names(paymentTypes),
      banks: names(banks),
      larkChannels: names(larkChannels),
    };
  }

  /**
   * Ghi danh muc vao sheet an "DanhSach" (moi danh muc 1 cot) roi gan dropdown
   * cho cac cot tuong ung tren sheet chinh, tu dong 2 den DROPDOWN_ROWS.
   */
  private _attachDropdowns(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    lists: Record<ListKey, string[]>,
  ): void {
    const listSheet = workbook.addWorksheet('DanhSach', { state: 'hidden' });

    // Vi tri cot cua tung danh muc tren sheet DanhSach (A, B, C...).
    let listCol = 0;
    COLUMNS.forEach((col, i) => {
      if (!col.listKey) return;
      const values = lists[col.listKey];
      if (values.length === 0) return; // danh muc rong -> bo qua, de go tay

      listCol++;
      const colLetter = this._colLetter(listCol);
      listSheet.getCell(`${colLetter}1`).value = col.header;
      values.forEach((v, r) => {
        listSheet.getCell(`${colLetter}${r + 2}`).value = v;
      });

      // Excel gioi han cong thuc validation 255 ky tu -> luon tham chieu vung o
      // sheet DanhSach thay vi nhung danh sach truc tiep vao cong thuc.
      const range = `DanhSach!$${colLetter}$2:$${colLetter}$${values.length + 1}`;
      const validation: ExcelJS.DataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [range],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Không có trong danh sách',
        error: `Giá trị không khớp danh mục "${col.header}" trong hệ thống. Vẫn dùng được nhưng import có thể báo lỗi dòng.`,
      };

      const mainColLetter = this._colLetter(i + 1);
      for (let row = 2; row <= DROPDOWN_ROWS; row++) {
        sheet.getCell(`${mainColLetter}${row}`).dataValidation = validation;
      }
    });
  }

  /** Chuyen so thu tu cot (1-based) thanh chu cai cot Excel: 1 -> A, 27 -> AA. */
  private _colLetter(n: number): string {
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
}
