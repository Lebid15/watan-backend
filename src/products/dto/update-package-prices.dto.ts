// backend/src/products/dto/update-package-prices.dto.ts
import { IsArray, IsNumber, IsUUID } from 'class-validator';

export class UpdatePackagePricesDto {
  @IsNumber()
  capital: number;

  @IsArray()
  prices: {
    groupId: string; // UUID لمجموعة الأسعار
    price: number;
  }[];
}
