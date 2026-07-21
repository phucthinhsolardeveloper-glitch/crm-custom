import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/** Body cho PATCH /call-feedbacks/:id - sua noi dung feedback. */
export class UpdateCallFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
