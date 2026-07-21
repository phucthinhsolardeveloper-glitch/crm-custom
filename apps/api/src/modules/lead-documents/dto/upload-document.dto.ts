import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body kèm theo multipart upload. File chính qua FileInterceptor (param 'file'). */
export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
