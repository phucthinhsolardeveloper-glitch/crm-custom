import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Cặp khoá mã hoá do trình duyệt sinh ra cho subscription. */
class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

/** Body POST /notifications/push/subscribe. userId KHÔNG nhận từ đây - lấy từ JWT. */
export class SubscribePushDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

/** Body POST /notifications/push/unsubscribe. */
export class UnsubscribePushDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}
