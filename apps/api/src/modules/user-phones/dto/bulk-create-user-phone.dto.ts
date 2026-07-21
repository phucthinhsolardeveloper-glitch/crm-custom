import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserPhoneDto } from './create-user-phone.dto';

/** Body POST /admin/user-phones/bulk - tạo hàng loạt. */
export class BulkCreateUserPhoneDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateUserPhoneDto)
  items!: CreateUserPhoneDto[];
}
