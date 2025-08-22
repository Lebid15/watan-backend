import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString() @Length(3, 120)
  name: string;

  // حروف صغيرة أرقام و- فقط
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/)
  code: string;

  // مالك المتجر (المشرف)
  @IsOptional() @IsEmail()
  ownerEmail?: string;

  @IsOptional() @IsString() @Length(2, 120)
  ownerName?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
