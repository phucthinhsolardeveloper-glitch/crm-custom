import { IsString, IsInt, IsPositive, IsOptional, IsDateString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO tạo payment. Quy ước tiền: integer VND (không dùng float).
 * Validate amount > 0 ở DTO layer; service có defense-in-depth check lần 2.
 */
export class CreatePaymentDto {
  @IsString()
  orderId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Số tiền phải là số nguyên (VND)' })
  @IsPositive({ message: 'Số tiền phải lớn hơn 0' })
  amount!: number;

  // Loại thanh toán bắt buộc - payment phải phân loại được ngay khi tạo.
  @IsNotEmpty({ message: 'Vui lòng chọn Loại thanh toán' })
  @IsString()
  paymentTypeId!: string;

  @IsOptional()
  @IsString()
  bankAccountId?: string;

  // Nội dung CK bắt buộc - dùng auto-match với bank transaction.
  @IsNotEmpty({ message: 'Vui lòng nhập Nội dung chuyển khoản' })
  @IsString()
  transferContent!: string;

  // Ngày CK bắt buộc: dùng để đối soát tiền và làm mốc cho bộ lọc ngày ở danh sách.
  @IsNotEmpty({ message: 'Vui lòng nhập Ngày CK' })
  @IsDateString({}, { message: 'transferDate không hợp lệ' })
  transferDate!: string;

  // vatAmount đã bỏ khỏi DTO: VAT fix cứng theo vatRate của đơn (đi theo sản phẩm),
  // server tự tách từ số tiền CK - không nhận từ client.

  // Đợt thanh toán bắt buộc - theo dõi CK lần 1/2/3... của đơn.
  @IsNotEmpty({ message: 'Vui lòng chọn Đợt thanh toán' })
  @IsString()
  installmentId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Bang Lark rieng cho payment (tuy chon). De trong -> dung bang cua don.
  @IsOptional()
  @IsString()
  larkSyncId?: string;
}
