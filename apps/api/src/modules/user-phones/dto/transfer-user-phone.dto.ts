import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body PATCH /admin/user-phones/:id/transfer - chuyển sang user khác. */
export class TransferUserPhoneDto {
  @IsString()
  newUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
