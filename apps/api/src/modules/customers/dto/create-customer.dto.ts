import { IsString, IsOptional, IsEmail, IsDateString } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  phone!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  zaloUrl?: string;

  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** ISO date string (YYYY-MM-DD). Năm chỉ dùng để biết KH bao tuổi, ngày tháng phục vụ reminder sinh nhật. */
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  assignedDepartmentId?: string;
}
