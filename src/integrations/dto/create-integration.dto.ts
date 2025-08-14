import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateIntegrationDto {
  @IsString() name!: string;

  @IsIn(['barakat', 'apstore', 'znet'])
  provider!: 'barakat' | 'apstore' | 'znet';

  // Barakat/Apstore
  @IsOptional() @IsString()
  baseUrl?: string; // افتراضي سنضعه في السيرفس

  @IsOptional() @IsString()
  apiToken?: string;

  // Znet (لاحقًا)
  @IsOptional() @IsString()
  kod?: string;

  @IsOptional() @IsString()
  sifre?: string;
}
