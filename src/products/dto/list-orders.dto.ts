import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class ListOrdersDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  // '' | 'manual' | providerId
  @IsOptional()
  @IsString()
  method?: string;

  // تنسيق YYYY-MM-DD (اختياري)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  // ===== خصائص مشتقة للاستعلام الرقمي الدقيق =====
  get isQDigitsOnly(): boolean {
    const s = this.q?.trim();
    return !!s && /^\d+$/.test(s);
  }

  get qDigits(): string | null {
    return this.isQDigitsOnly ? this.q!.trim() : null;
  }
}

export default ListOrdersDto;
