import { Type } from 'class-transformer';
import { IsOptional, IsDate } from 'class-validator';

export class FilterDateDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
