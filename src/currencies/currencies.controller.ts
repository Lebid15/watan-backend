import { Controller, Get, Post, Body, Put, Param, Delete } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { Currency } from './currency.entity';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  findAll(): Promise<Currency[]> {
    return this.currenciesService.findAll();
  }

  @Post()
  create(@Body() currency: Partial<Currency>): Promise<Currency> {
    const allowed: Partial<Currency> = {
      name: currency.name,
      code: currency.code,
      rate: currency.rate,
      isActive: currency.isActive,
      isPrimary: currency.isPrimary,
      symbolAr: currency.symbolAr,
    };
    return this.currenciesService.create(allowed);
  }

  // ✅ التحديث الجماعي — يستقبل { currencies: [...] }
  @Put('bulk-update')
  async bulkUpdate(@Body() body: { currencies: Partial<Currency>[] }) {
    if (!body || !Array.isArray(body.currencies)) {
      throw new Error('⚠ البيانات المرسلة يجب أن تكون بالشكل { currencies: [...] }');
    }
    return this.currenciesService.bulkUpdate(body.currencies);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<boolean> {
    return this.currenciesService.remove(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() currency: Partial<Currency>): Promise<Currency> {
    const allowed: Partial<Currency> = {
      name: currency.name,
      code: currency.code,
      rate: currency.rate,
      isActive: currency.isActive,
      isPrimary: currency.isPrimary,
      symbolAr: currency.symbolAr,
    };
    return this.currenciesService.update(id, allowed);
  }
}
