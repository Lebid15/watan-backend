import { IsOptional, IsIn, IsBooleanString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListNotificationsDto {
  @IsOptional()
  @IsBooleanString()
  isRead?: string; // "true"/"false"

  @IsOptional()
  @IsIn(['in_app','email','sms'])
  channel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
