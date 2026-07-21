import { IsString, IsInt, IsPositive, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO sửa payment (PATCH). Chỉ whitelist field payment-level cho phép chỉnh.
 * Field verify (status, verifiedBy, verifiedAt, verifiedSource) + orderId KHÔNG có ở đây
 * -> caller không thể tự set VERIFIED hay chuyển payment sang đơn khác qua endpoint này.
 */
export class UpdatePaymentDto {
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'transferDate không hợp lệ' })
  transferDate?: string;

  @IsOptional()
  @IsString()
  transferContent?: string;

  @IsOptional()
  @IsString()
  paymentTypeId?: string;

  @IsOptional()
  @IsString()
  installmentId?: string;

  // Sửa amount chỉ áp dụng khi payment còn PENDING (service enforce).
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Số tiền phải là số nguyên (VND)' })
  @IsPositive({ message: 'Số tiền phải lớn hơn 0' })
  amount?: number;

  // vatAmount đã bỏ khỏi DTO: VAT fix cứng theo vatRate của đơn, server tự tính lại
  // khi amount đổi - không nhận từ client.

  @IsOptional()
  @IsString()
  notes?: string;
}
