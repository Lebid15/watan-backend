// src/currencies/currencies.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from './currency.entity';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';

@Module({
  imports: [TypeOrmModule.forFeature([Currency])],
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
  exports: [
    CurrenciesService,
    TypeOrmModule, // ✅ تصدير TypeOrmModule ليتمكن أي Module آخر من حقن CurrencyRepository
  ],
})
export class CurrenciesModule {}
