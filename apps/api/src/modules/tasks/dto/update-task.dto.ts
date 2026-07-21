import {
  IsString, IsOptional, IsISO8601, IsArray,
  ArrayMaxSize, ValidateNested, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskReminderDto } from './create-task.dto';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TaskReminderDto)
  reminders?: TaskReminderDto[];
}
