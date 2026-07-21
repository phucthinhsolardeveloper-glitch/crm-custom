import { IsString, IsOptional, IsEnum, IsEmail, MinLength, MaxLength } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

/** Self-update DTO: limited fields only. */
export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  /** Bắt buộc khi đổi password (self-service) - xác minh chủ tài khoản, chống chiếm phiên. */
  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

/** Admin update DTO: all fields including role, department, status.
 *  email is SUPER_ADMIN only - enforced in service layer (MANAGER request rejected). */
export class AdminUpdateUserDto extends UpdateUserProfileDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  employeeLevelId?: string;
}
