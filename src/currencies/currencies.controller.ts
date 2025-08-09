import { Body, Controller, Delete, Get, Param, Patch, Post, Put, BadRequestException } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { Currency } from './currency.entity';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  /** إرجاع كل العملات */
  @Get()
  async findAll(): Promise<Currency[]> {
    return this.service.findAll();
  }

  /** إنشاء عملة جديدة */
  @Post()
  async create(@Body() body: Partial<Currency>): Promise<Currency> {
    return this.service.create(body);
  }

    /** ✅ التحديث الجماعي كما كان: PUT /currencies/bulk-update */
  @Put('bulk-update')
  async bulkUpdate(@Body() body: any): Promise<Currency[]> {
    const list: Partial<Currency>[] = Array.isArray(body) ? body : body?.currencies;
    if (!Array.isArray(list)) {
      throw new BadRequestException('Body must be an array of currencies or { currencies: [...] }');
    }
    return this.service.bulkUpdate(list);
  }

  /** تحديث عملة واحدة */
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: Partial<Currency>): Promise<Currency> {
    return this.service.update(id, body);
  }

  /** حذف عملة */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ ok: boolean }> {
    const ok = await this.service.remove(id);
    return { ok };
  }

  /** ✅ زرع العملات الافتراضية (مرة واحدة) */
  @Post('seed-defaults')
  async seedDefaults(): Promise<Currency[]> {
    return this.service.seedDefaults();
  }
}
