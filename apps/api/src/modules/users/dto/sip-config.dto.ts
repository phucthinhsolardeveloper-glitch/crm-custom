import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * SIP credentials OmiCall do super_admin nhap cho tung user.
 * sipPassword ma hoa AES-256-GCM truoc khi luu (xem users.service.ts) - service
 * giai ma khi tra ve cho admin (form edit) hoac chinh user (SDK can password goc).
 */
export class UpsertSipConfigDto {
  @IsString()
  @IsNotEmpty({ message: 'sipRealm là bắt buộc' })
  @MaxLength(255)
  sipRealm!: string;

  @IsString()
  @IsNotEmpty({ message: 'sipUser là bắt buộc' })
  @MaxLength(255)
  sipUser!: string;

  @IsString()
  @IsNotEmpty({ message: 'sipPassword là bắt buộc' })
  @MaxLength(255)
  sipPassword!: string;
}
