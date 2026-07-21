import { IsString, IsOptional, IsNumber, MaxLength, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO loose validation cho CDR webhook OmiCall.
 * - Chi 2 field bat buoc: call_uuid, state.
 * - Cac field khac optional vi OmiCall co the omit hoac doi format.
 * - `transcript` co the la string hoac null (khi chua co ASR).
 * - KHONG dung whitelist mode global - extra field passthrough OK.
 */

export class OmicallCreateByDto {
  @IsOptional() @IsString()
  id?: string;

  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  type?: string;
}

export class OmicallCdrDto {
  @IsString() @MaxLength(128)
  call_uuid!: string;

  @IsString() @MaxLength(32)
  state!: string;

  @IsOptional() @IsString() @MaxLength(32)
  direction?: string;

  @IsOptional() @IsString() @MaxLength(32)
  disposition?: string;

  @IsOptional() @IsString() @MaxLength(32)
  phone_number?: string;

  @IsOptional() @IsString() @MaxLength(32)
  from_number?: string;

  @IsOptional() @IsString() @MaxLength(32)
  to_number?: string;

  @IsOptional() @IsString() @MaxLength(32)
  sip_user?: string;

  @IsOptional() @IsNumber()
  time_start_call?: number;

  @IsOptional() @IsNumber()
  bill_sec?: number;

  @IsOptional() @IsNumber()
  answer_sec?: number;

  @IsOptional() @IsString() @MaxLength(64)
  hangup_cause?: string;

  @IsOptional() @IsString() @MaxLength(64)
  endby_name?: string;

  @IsOptional() @IsString() @MaxLength(2048)
  recording_file_url?: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => OmicallCreateByDto)
  create_by?: OmicallCreateByDto;

  @IsOptional() @MaxLength(20000)
  transcript?: string | null;
}
