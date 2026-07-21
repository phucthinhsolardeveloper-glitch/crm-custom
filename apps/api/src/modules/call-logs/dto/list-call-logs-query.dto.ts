import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Query params cho GET /call-logs.
 * Mo rong PaginationQueryDto voi cac filter chuyen biet (date range, sale, type, AI score).
 * Phai khai bao day du vi global ValidationPipe co forbidNonWhitelisted = true -
 * field khong duoc whitelist se bi reject 400.
 */
export class ListCallLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Deep-link 1 cuoc goi cu the (vd tu notification feedback) -> hien dung cuoc do (van scope theo role).
  @IsOptional()
  @IsString()
  callId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(['INCOMING', 'OUTGOING', 'MISSED'])
  callType?: string;

  @IsOptional()
  @IsIn(['AUTO_MATCHED', 'MANUALLY_MATCHED', 'UNMATCHED'])
  matchStatus?: string;

  // AI bento filter (v2). Score range 0-10, hasAi = true loc cuoc co phan tich AI v2.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  maxScore?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  hasAi?: string;
}
