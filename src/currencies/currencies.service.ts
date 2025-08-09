import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.entity';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currenciesRepo: Repository<Currency>,
  ) {}

  /** جلب جميع العملات */
  async findAll(): Promise<Currency[]> {
    return this.currenciesRepo.find({ order: { code: 'ASC' } });
  }

  /** إنشاء عملة جديدة */
  async create(currency: Partial<Currency>): Promise<Currency> {
    const newCurrency = this.currenciesRepo.create(currency);
    return this.currenciesRepo.save(newCurrency);
  }

  /** تحديث عملة واحدة */
  async update(id: string, currency: Partial<Currency>): Promise<Currency> {
    const allowedFields: Partial<Currency> = {};
    if (currency.name !== undefined) allowedFields.name = currency.name;
    if (currency.code !== undefined) allowedFields.code = currency.code;
    if (currency.rate !== undefined) allowedFields.rate = currency.rate;
    if (currency.isActive !== undefined) allowedFields.isActive = currency.isActive;
    if (currency.isPrimary !== undefined) allowedFields.isPrimary = currency.isPrimary;
    if (currency.symbolAr !== undefined) allowedFields.symbolAr = currency.symbolAr;

    if (Object.keys(allowedFields).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    await this.currenciesRepo.update(id, allowedFields);

    const updated = await this.currenciesRepo.findOneBy({ id });
    if (!updated) {
      throw new NotFoundException(`Currency with id ${id} not found`);
    }
    return updated;
  }

  /** حذف عملة */
  async remove(id: string): Promise<boolean> {
    const result = await this.currenciesRepo.delete(id);
    return !!(result.affected && result.affected > 0);
  }

  /** تحديث عدة عملات دفعة واحدة */
  async bulkUpdate(currencies: Partial<Currency>[]): Promise<Currency[]> {
    const results: Currency[] = [];

    for (const c of currencies) {
      if (!c.id) continue;

      const allowed: Partial<Currency> = {};
      if (c.name !== undefined) allowed.name = c.name;
      if (c.code !== undefined) allowed.code = c.code;
      if (c.rate !== undefined) allowed.rate = c.rate;
      if (c.isActive !== undefined) allowed.isActive = c.isActive;
      if (c.isPrimary !== undefined) allowed.isPrimary = c.isPrimary;
      if (c.symbolAr !== undefined) allowed.symbolAr = c.symbolAr;

      if (Object.keys(allowed).length > 0) {
        await this.currenciesRepo.update(c.id, allowed);
        const updated = await this.currenciesRepo.findOneBy({ id: c.id });
        if (updated) results.push(updated);
      }
    }

    return results;
  }

  /** ✅ زرع العملات الأساسية مرة واحدة (لن تُنشأ المكررة) */
  async seedDefaults(): Promise<Currency[]> {
    const defaults: Array<Partial<Currency>> = [
      { code: 'USD', name: 'US Dollar',         symbolAr: '$',  isActive: true, rate: 1 },
      { code: 'EUR', name: 'Euro',              symbolAr: '€',  isActive: true, rate: 1 },
      { code: 'TRY', name: 'Turkish Lira',      symbolAr: '₺',  isActive: true, rate: 1 },
      { code: 'EGP', name: 'Egyptian Pound',    symbolAr: '£',  isActive: true, rate: 1 },
      { code: 'SAR', name: 'Saudi Riyal',       symbolAr: '﷼',  isActive: true, rate: 1 },
      { code: 'AED', name: 'UAE Dirham',        symbolAr: 'د.إ', isActive: true, rate: 1 },
      { code: 'SYP', name: 'Syrian Pound',      symbolAr: 'ل.س', isActive: true, rate: 1 },
    ];

    for (const c of defaults) {
      const exists = await this.currenciesRepo.findOne({ where: { code: c.code as string } });
      if (!exists) {
        await this.currenciesRepo.save(this.currenciesRepo.create(c));
      }
    }

    return this.findAll();
  }
}
