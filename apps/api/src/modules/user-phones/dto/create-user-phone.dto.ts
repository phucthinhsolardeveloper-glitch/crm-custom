import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body POST /admin/user-phones - phân 1 SĐT cho 1 user. */
export class CreateUserPhoneDto {
  @IsString()
  phone!: string; // sẽ normalize trong service

  @IsString()
  userId!: string; // BigInt as string from JSON

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
