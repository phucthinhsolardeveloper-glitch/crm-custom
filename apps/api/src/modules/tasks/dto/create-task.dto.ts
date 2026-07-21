import {
  IsString, IsOptional, IsISO8601, IsArray,
  ArrayMaxSize, ValidateNested, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TaskReminderDto {
  @IsISO8601()
  remindAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;
}

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  assignedTo!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TaskReminderDto)
  reminders?: TaskReminderDto[];
}
