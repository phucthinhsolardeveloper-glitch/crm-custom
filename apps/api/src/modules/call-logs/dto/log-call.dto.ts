import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min, MaxLength } from 'class-validator';
import { CallType } from '@prisma/client';

// Shared body shape cho POST /call-logs/ingest (API key, 3rd party) va /call-logs/from-web (JWT, OmiCall SDK).
// Validation chan invalid date / callType la, duration am, payload qua dai.
export class LogCallDto {
  @IsString()
  @MaxLength(128)
  externalId!: string;

  @IsString()
  @MaxLength(32)
  phoneNumber!: string;

  @IsEnum(CallType)
  callType!: CallType;

  @IsDateString()
  callTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;
}
