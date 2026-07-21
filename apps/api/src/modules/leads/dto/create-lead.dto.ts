import { IsString, IsOptional, IsEmail, IsObject, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

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
  notes?: string;

  /** Ghi chú ban đầu - tạo activity NOTE cùng transaction với lead. Trim + skip nếu rỗng. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /**
   * Trường tùy chỉnh { key: value }. Key phải khớp lead_field_definitions đang active,
   * value là string (max 500) - validate chi tiết ở service (LeadFieldDefinitionsService).
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
