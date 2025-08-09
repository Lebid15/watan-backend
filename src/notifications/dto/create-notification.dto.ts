import { IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  meta?: Record<string, any>;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsIn(['in_app', 'email', 'sms'])
  channel?: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high'])
  priority?: string;

  @IsOptional()
  @IsIn(['wallet_topup', 'wallet_debit', 'order_status_changed', 'announcement'])
  type?: string;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean; // نادرًا، لكن ندعه للاستخدام الداخلي
}
