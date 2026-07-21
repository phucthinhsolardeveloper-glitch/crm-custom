import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body POST /customers/:id/phones - thêm số phụ. */
export class AddCustomerPhoneDto {
  @IsString()
  phone!: string; // sẽ normalize trong service

  @IsOptional() @IsString() @MaxLength(50)
  label?: string; // VD: "Vợ", "Thư ký", "Công ty"

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

/** Body PATCH /customers/:id/phones/:phoneId - update partial. */
export class UpdateCustomerPhoneDto {
  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString() @MaxLength(50)
  label?: string;

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}
