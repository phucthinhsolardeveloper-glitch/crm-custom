import { IsOptional, IsString, IsInt, IsIn, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCronRunDto {
  @IsOptional()
  @IsString()
  jobName?: string;

  @IsOptional()
  @IsIn(['RUNNING', 'SUCCESS', 'FAILED'])
  status?: 'RUNNING' | 'SUCCESS' | 'FAILED';

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
