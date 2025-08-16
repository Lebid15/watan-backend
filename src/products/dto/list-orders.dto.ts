// src/products/dto/list-orders.dto.ts
import { IsIn, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export type OrderStatus = 'pending' | 'approved' | 'rejected';

const DIGIT_MAP: Record<string, string> = {
  '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
  '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
};
function normalizeDigits(s: string) {
  return s.replace(/[٠-٩۰-۹]/g, ch => DIGIT_MAP[ch] ?? ch);
}
function normalizeText(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u200c\u200d\u200e\u200f\u061C]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class ListOrdersDto {
  @IsOptional() @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeText(value) : ''))
  q?: string = '';

  @IsOptional() @IsString()
  @IsIn(['pending', 'approved', 'rejected', ''])
  status?: '' | OrderStatus = '';

  /** method: '' | 'manual' | providerId */
  @IsOptional() @IsString()
  method?: string = '';

  @IsOptional() @IsString()
  from?: string = ''; // YYYY-MM-DD

  @IsOptional() @IsString()
  to?: string = ''; // YYYY-MM-DD

  @IsOptional() @IsString()
  cursor?: string = '';

  @IsOptional() @IsNumber()
  @Transform(({ value }) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 25;
    return Math.max(1, Math.min(100, n));
  })
  limit: number = 25;

  /** helpers */
  get isQDigitsOnly(): boolean {
    const q = this.q || '';
    if (!q) return false;
    const digitsOnly = normalizeDigits(q).replace(/[^\d]/g, '');
    return digitsOnly.length > 0 && digitsOnly === normalizeDigits(q).replace(/\s+/g, '');
  }
  get qDigits(): string {
    return normalizeDigits(this.q || '').replace(/[^\d]/g, '');
  }
}
