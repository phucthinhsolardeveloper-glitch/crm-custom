/**
 * Preset field-map 6 kenh - nguon cho nut "Tai mau" tren UI.
 * Preset theo TEN KENH (khong hardcode categoryId); admin chon kenh roi
 * "Tai mau" -> UI do san baseToken + tableId + fieldMap, sua tiep neu can.
 *
 * Tat ca tro toi 1 base dich chung (BASE_TOKEN ben duoi).
 * Cot cong thuc ben Lark (THUE VAT, % VAT, Thang, DOANH SO GHI NHAN, THUONG...)
 * KHONG co trong map - Lark tu tinh. Cot ke toan nhap tay (KE TOAN XAC NHAN,
 * DOI SOAT LOI, FILE, PHI NGAN LUONG, CHI PHI...) cung khong map.
 *
 * Luu y: cac cot ben Lark co kieu User/Number/Select can duoc doi sang Text
 * thu cong tren Lark de nhan gia tri chuoi tu CRM.
 */
export interface LarkSyncPreset {
  channelName: string;
  baseToken: string;
  tableId: string;
  fieldMap: Record<string, string>;
}

/** Base dich chung cho 6 kenh. */
const BASE_TOKEN = process.env.LARK_BASE_TOKEN ?? 'YOUR_LARK_BASE_TOKEN';

export const LARK_SYNC_PRESETS: LarkSyncPreset[] = [
  {
    channelName: 'Zoom phễu',
    baseToken: BASE_TOKEN,
    tableId: process.env.LARK_TABLE_1 ?? 'YOUR_LARK_TABLE_ID',
    fieldMap: {
      'Ngày': 'ngay',
      'NGÀY TT LẦN 1': 'ngayTT',
      'NHÂN VIÊN': 'nhanVien',
      'NHÓM': 'nhomSP',
      'NGUỒN': 'nguon',
      'KHOÁ': 'khoa',
      'STT': 'sttNgay',
      'HÌNH THỨC': 'hinhThucToChuc',
      'TÊN KHÁCH': 'tenKhach',
      'SỐ ĐIỆN THOẠI': 'sdt',
      'ĐỊA CHỈ KHÁCH': 'diaChi',
      'TÊN SẢN PHẨM': 'tenSP',
      'GIÁ BÁN NIÊM YẾT': 'giaNiemYet',
      'DOANH THU VỀ CTY': 'soTien',
      'SỐ LẦN TT': 'phanLoaiTT',
      'TÌNH TRẠNG TT': 'trangThaiPayment',
      'HÌNH THỨC TT': 'hinhThucTT',
      'NGÂN HÀNG': 'nganHang',
      'MÃ GD': 'maGD',
      'GHI CHÚ': 'ghiChu',
    },
  },
  {
    channelName: 'Sale bán lẻ',
    baseToken: BASE_TOKEN,
    tableId: process.env.LARK_TABLE_2 ?? 'YOUR_LARK_TABLE_ID',
    fieldMap: {
      'NGÀY': 'ngay',
      'NGÀY TT LẦN 1': 'ngayTT',
      'NHÂN VIÊN': 'nhanVien',
      'TEAM': 'team',
      'NHÓM': 'nhomSP',
      'STT CỦA LỚP': 'stt',
      'NGUỒN': 'nguon',
      'TÊN': 'tenKhach',
      'SỐ ĐIỆN THOẠI': 'sdt',
      'ĐỊA CHỈ KHÁCH': 'diaChi',
      'TÊN SẢN PHẨM': 'tenSP',
      'GIÁ BÁN NIÊM YẾT': 'giaNiemYet',
      'DOANH THU VỀ CÔNG TY': 'soTien',
      'SỐ LẦN TT': 'phanLoaiTT',
      'TÌNH TRẠNG TT': 'trangThaiPayment',
      'HÌNH THỨC TT': 'hinhThucTT',
      'NGÂN HÀNG': 'nganHang',
      'MÃ GD': 'maGD',
      'GHI CHÚ': 'ghiChu',
    },
  },
  {
    channelName: 'Sale TVDN',
    baseToken: BASE_TOKEN,
    tableId: process.env.LARK_TABLE_3 ?? 'YOUR_LARK_TABLE_ID',
    fieldMap: {
      'Ngày': 'ngay',
      'NGÀY TT LẦN 1': 'ngayTT',
      'NHÂN VIÊN': 'nhanVien',
      'TEAM': 'team',
      'NGUỒN': 'nguon',
      'TÊN CÔNG TY': 'tenCongTy',
      'TÊN KHÁCH HÀNG': 'tenKhach',
      'SỐ ĐIỆN THOẠI': 'sdt',
      'ĐỊA CHỈ KHÁCH': 'diaChi',
      'MST': 'mst',
      'EMAIL CÔNG TY': 'email',
      'GÓI DỊCH VỤ': 'tenSP',
      'GIÁ BÁN NIÊM YẾT': 'giaNiemYet',
      'DOANH THU VỀ CTY': 'soTien',
      'SỐ LẦN TT': 'phanLoaiTT',
      'PHÂN LOẠI': 'phanLoaiTT',
      'TÌNH TRẠNG THANH TOÁN': 'trangThaiPayment',
      'HÌNH THỨC THANH TOÁN': 'hinhThucTT',
      'NGÂN HÀNG': 'nganHang',
      'MÃ GD': 'maGD',
      'GHI CHÚ': 'ghiChu',
    },
  },
  {
    channelName: 'Camp',
    baseToken: BASE_TOKEN,
    tableId: process.env.LARK_TABLE_4 ?? 'YOUR_LARK_TABLE_ID',
    fieldMap: {
      'NGÀY': 'ngay',
      'NGÀY TT LẦN 1': 'ngayTT',
      'NHÂN VIÊN': 'nhanVien',
      'TEAM': 'team',
      'NHÓM': 'nhomSP',
      'NGUỒN': 'nguon',
      'TÊN KHÁCH': 'tenKhach',
      'SỐ ĐIỆN THOẠI': 'sdt',
      'ĐỊA CHỈ KHÁCH': 'diaChi',
      'TÊN SẢN PHẨM': 'tenSP',
      'GIÁ BÁN NIÊM YẾT': 'giaNiemYet',
      'DOANH THU VỀ CÔNG TY': 'soTien',
      'SỐ LẦN TT': 'phanLoaiTT',
      'TÌNH TRẠNG TT': 'trangThaiPayment',
      'HÌNH THỨC TT': 'hinhThucTT',
      'NGÂN HÀNG': 'nganHang',
      'MÃ GD': 'maGD',
      'GHI CHÚ': 'ghiChu',
    },
  },
  {
    channelName: 'Sếp chốt',
    baseToken: BASE_TOKEN,
    tableId: process.env.LARK_TABLE_5 ?? 'YOUR_LARK_TABLE_ID',
    fieldMap: {
      'NGÀY': 'ngay',
      'NGÀY TT LẦN 1': 'ngayTT',
      'NHÂN VIÊN': 'nhanVien',
      'NHÓM': 'nhomSP',
      'NGUỒN': 'nguon',
      'HÌNH THỨC': 'hinhThucToChuc',
      'TÊN KHÁCH HÀNG': 'tenKhach',
      'SỐ ĐIỆN THOẠI': 'sdt',
      'ĐỊA CHỈ KHÁCH': 'diaChi',
      'MST': 'mst',
      'EMAIL': 'email',
      'TÊN SẢN PHẨM': 'tenSP',
      'GIÁ BÁN NIÊM YẾT': 'giaNiemYet',
      'DOANH THU VỀ CÔNG TY': 'soTien',
      'SỐ LẦN TT': 'phanLoaiTT',
      'PHÂN LOẠI': 'phanLoaiTT',
      'TÌNH TRẠNG TT': 'trangThaiPayment',
      'HÌNH THỨC TT': 'hinhThucTT',
      'NGÂN HÀNG': 'nganHang',
      'MÃ GD': 'maGD',
      'GHI CHÚ': 'ghiChu',
    },
  },
  {
    channelName: 'SP liên kết',
    baseToken: BASE_TOKEN,
    tableId: process.env.LARK_TABLE_6 ?? 'YOUR_LARK_TABLE_ID',
    fieldMap: {
      'NGÀY': 'ngay',
      'NGÀY TT LẦN 1': 'ngayTT',
      'NHÂN VIÊN': 'nhanVien',
      'NHÓM': 'nhomSP',
      'NGUỒN': 'nguon',
      'HÌNH THỨC TỔ CHỨC': 'hinhThucToChuc',
      'TÊN KHÁCH': 'tenKhach',
      'SỐ ĐIỆN THOẠI': 'sdt',
      'ĐỊA CHỈ': 'diaChi',
      'TÊN SẢN PHẨM': 'tenSP',
      'GIÁ BÁN NIÊM YẾT': 'giaNiemYet',
      'DOANH THU VỀ CÔNG TY': 'soTien',
      'SỐ LẦN TT': 'phanLoaiTT',
      'PHÂN LOẠI THANH TOÁN': 'phanLoaiTT',
      'TÌNH TRẠNG TT': 'trangThaiPayment',
      'HÌNH THỨC THANH TOÁN': 'hinhThucTT',
      'NGÂN HÀNG': 'nganHang',
      'MÃ GD': 'maGD',
      'GHI CHÚ': 'ghiChu',
    },
  },
  {
    // Bang hoan tien (dien tay o trang /refunds). Chi map cot CRM day duoc:
    // bo cot formula (Lark tu tinh), attachment (BILL CK) va user (NHAN VIEN -
    // doi sang Text ben Lark neu muon day ten nhan vien).
    channelName: 'Bảng hoàn tiền',
    baseToken: BASE_TOKEN,
    tableId: process.env.LARK_TABLE_7 ?? 'YOUR_LARK_TABLE_ID',
    fieldMap: {
      'TÊN KHÁCH': 'tenKhach',
      'SỐ ĐIỆN THOẠI': 'sdt',
      'SẢN PHẨM': 'tenSP',
      'DOANH THU VỀ CÔNG TY': 'giaNiemYet',
      '% VAT': 'vatRate',
      'SỐ TIỀN HOÀN TRẢ KHÁCH': 'soTien',
      'NHÓM': 'nhomSP',
      'TEAM': 'team',
      'NGÀY HOÀN TIỀN': 'ngay',
      'HÌNH THỨC HOÀN': 'hinhThucTT',
      'NGÂN HÀNG HOÀN': 'nganHang',
      'GHI CHÚ': 'ghiChu',
    },
  },
];
