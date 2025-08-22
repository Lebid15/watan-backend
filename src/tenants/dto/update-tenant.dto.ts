import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional() @IsString() @Length(3, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/)
  code?: string;

  @IsOptional() @IsString()
  ownerUserId?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
