import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/** Body cho POST /call-feedbacks - tao feedback cho 1 cuoc goi. */
export class CreateCallFeedbackDto {
  @IsString()
  @IsNotEmpty()
  callLogId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
