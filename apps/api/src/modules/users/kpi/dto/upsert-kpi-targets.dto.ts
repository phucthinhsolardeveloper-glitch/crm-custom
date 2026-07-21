import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Upsert KPI doanh số cho 1 user / 1 năm.
 * Tất cả field optional - NULL = chưa set (khác 0).
 * Min 0 - không cho phép target âm. Max 999_999_999_999 (~999 tỷ) khớp Decimal(14,2).
 */
export class UpsertKpiTargetsDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetYearly?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetJan?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetFeb?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetMar?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetApr?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetMay?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetJun?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetJul?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetAug?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetSep?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetOct?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetNov?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999_999)
  targetDec?: number;
}
