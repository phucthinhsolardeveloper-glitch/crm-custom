import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Query cho đối soát theo mệnh giá. `from`/`to` là mốc thời gian Vietnam
 * (wall-clock, có thể kèm offset +07:00 hoặc naive). Service anchor về UTC+7
 * trước khi query. Validate from <= to nằm ở service (cần parse trước).
 */
export class ReconciliationQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn thời gian bắt đầu (from)' })
  from!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn thời gian kết thúc (to)' })
  to!: string;

  // Tên tài khoản ngân hàng đối soát (khớp BankAccount.name = BankTransaction.bankAccount).
  // Bỏ trống = đối soát tất cả ngân hàng.
  @IsOptional()
  @IsString()
  bankAccount?: string;
}
