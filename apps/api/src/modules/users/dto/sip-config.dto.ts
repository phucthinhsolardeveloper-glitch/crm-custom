import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * SIP credentials OmiCall do super_admin nhap cho tung user.
 * sipPassword luu plaintext (app noi bo, HTTPS) - SDK can password goc de register tong dai.
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
