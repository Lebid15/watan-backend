import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class AddDomainDto {
  @IsString()
  @Matches(/^[a-z0-9.-]{3,190}$/i)
  domain: string;

  @IsIn(['subdomain', 'custom'])
  type: 'subdomain' | 'custom';

  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}
