import { IsOptional, IsString, IsInt, IsIn, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditLogDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  /** Comma-separated list also accepted; service splits. */
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsIn(['POST', 'PUT', 'PATCH', 'DELETE'])
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /** Either a precise code (e.g. 404) or a class shortcut: '2xx' | '4xx' | '5xx'. */
  @IsOptional()
  @IsString()
  statusCode?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
