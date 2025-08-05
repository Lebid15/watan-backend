// src/users/dto/update-user.dto.ts
import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  // أدوار أخرى حسب المشروع
}

export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}
