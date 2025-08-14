import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class PlaceOrderDto {
  @IsString() productId!: string; // أو number كنص
  @IsNumber() qty!: number;

  // مفاتيح ديناميكية مثل playerId أو ما شابه
  @IsObject() params!: Record<string, string | number>;

  @IsOptional() @IsString()
  clientOrderUuid?: string; // لو أرسله الفرونت، وإلا نولده
}
