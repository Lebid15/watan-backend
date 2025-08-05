// src/currencies/currencies.controller.ts
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
    return this.currenciesService.create(currency);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() currency: Partial<Currency>): Promise<Currency> {
    return this.currenciesService.update(id, currency);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<boolean> {
    return this.currenciesService.remove(id);
  }
}
