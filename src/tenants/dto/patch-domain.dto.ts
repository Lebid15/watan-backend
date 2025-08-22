import { IsBoolean, IsOptional } from 'class-validator';

export class PatchDomainDto {
  @IsOptional() @IsBoolean()
  isPrimary?: boolean;

  @IsOptional() @IsBoolean()
  isVerified?: boolean;
}
