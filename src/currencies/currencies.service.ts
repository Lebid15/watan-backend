import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Currency } from './currency.entity';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currenciesRepo: Repository<Currency>,
  ) {}

  /** داخلي: جعل كل عملات المستأجر غير أساسية ما عدا المعروضة */
  private async ensureUniquePrimary(tenantId: string, keepId: string) {
    await this.currenciesRepo
      .createQueryBuilder()
      .update(Currency)
      .set({ isPrimary: false })
      .where('"tenantId" = :tenantId AND id <> :keepId', { tenantId, keepId })
      .execute();
  }

  /** جلب جميع العملات لمستأجر معيّن */
  async findAll(tenantId: string): Promise<Currency[]> {
    return this.currenciesRepo.find({
      where: { tenantId },
      order: { code: 'ASC' },
    });
  }

  /** إنشاء عملة جديدة لمستأجر */
  async create(tenantId: string, currency: Partial<Currency>): Promise<Currency> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    // منع تكرار code داخل نفس المستأجر
    if (currency.code) {
      const exists = await this.currenciesRepo.findOne({ where: { tenantId, code: currency.code } });
      if (exists) throw new ConflictException(`Currency code "${currency.code}" already exists for this tenant`);
    }

    const newCurrency = this.currenciesRepo.create({ ...currency, tenantId });

    const saved = await this.currenciesRepo.save(newCurrency);

    // ضمان واحدة أساسية فقط لكل مستأجر
    if (saved.isPrimary === true) {
      await this.ensureUniquePrimary(tenantId, saved.id);
    }

    return saved;
  }

  /** تحديث عملة واحدة داخل مستأجر */
  async update(tenantId: string, id: string, currency: Partial<Currency>): Promise<Currency> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const current = await this.currenciesRepo.findOne({ where: { id, tenantId } });
    if (!current) throw new NotFoundException(`Currency not found for this tenant`);

    const allowed: Partial<Currency> = {};
    if (currency.name !== undefined) allowed.name = currency.name;
    if (currency.code !== undefined) allowed.code = currency.code;
    if (currency.rate !== undefined) allowed.rate = currency.rate as any;
    if (currency.isActive !== undefined) allowed.isActive = currency.isActive;
    if (currency.isPrimary !== undefined) allowed.isPrimary = currency.isPrimary;
    if (currency.symbolAr !== undefined) allowed.symbolAr = currency.symbolAr;

    if (Object.keys(allowed).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    // تحقق من تفرّد code داخل نفس المستأجر إذا تغيّر
    if (allowed.code && allowed.code !== current.code) {
      const dup = await this.currenciesRepo.findOne({ where: { tenantId, code: allowed.code } });
      if (dup) throw new ConflictException(`Currency code "${allowed.code}" already exists for this tenant`);
    }

    await this.currenciesRepo.update({ id, tenantId }, allowed);

    const updated = await this.currenciesRepo.findOne({ where: { id, tenantId } });
    if (!updated) throw new NotFoundException(`Currency with id ${id} not found`);

    if (updated.isPrimary === true) {
      await this.ensureUniquePrimary(tenantId, updated.id);
    }

    return updated;
  }

  /** حذف عملة داخل مستأجر */
  async remove(tenantId: string, id: string): Promise<boolean> {
    const result = await this.currenciesRepo.delete({ id, tenantId });
    return !!(result.affected && result.affected > 0);
  }

  /** تحديث عدة عملات دفعة واحدة داخل مستأجر */
  async bulkUpdate(tenantId: string, currencies: Partial<Currency>[]): Promise<Currency[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const results: Currency[] = [];
    let primaryToKeep: string | null = null;

    for (const c of currencies) {
      if (!c.id) continue;

      const current = await this.currenciesRepo.findOne({ where: { id: c.id, tenantId } });
      if (!current) continue;

      const allowed: Partial<Currency> = {};
      if (c.name !== undefined) allowed.name = c.name;
      if (c.code !== undefined) allowed.code = c.code;
      if (c.rate !== undefined) allowed.rate = c.rate as any;
      if (c.isActive !== undefined) allowed.isActive = c.isActive;
      if (c.isPrimary !== undefined) allowed.isPrimary = c.isPrimary;
      if (c.symbolAr !== undefined) allowed.symbolAr = c.symbolAr;

      if (allowed.code && allowed.code !== current.code) {
        const dup = await this.currenciesRepo.findOne({ where: { tenantId, code: allowed.code } });
        if (dup) throw new ConflictException(`Currency code "${allowed.code}" already exists for this tenant`);
      }

      await this.currenciesRepo.update({ id: c.id, tenantId }, allowed);
      const updated = await this.currenciesRepo.findOne({ where: { id: c.id, tenantId } });
      if (updated) {
        results.push(updated);
        if (updated.isPrimary === true) primaryToKeep = updated.id;
      }
    }

    if (primaryToKeep) {
      await this.ensureUniquePrimary(tenantId, primaryToKeep);
    }

    return results;
  }

  /** زرع العملات الأساسية لمستأجر معيّن (لن تُنشأ المكررة حسب code+tenant) */
  async seedDefaults(tenantId: string): Promise<Currency[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const defaults: Array<Partial<Currency>> = [
      { code: 'USD', name: 'US Dollar',      symbolAr: '$',  isActive: true, rate: 1 },
      { code: 'EUR', name: 'Euro',           symbolAr: '€',  isActive: true, rate: 1 },
      { code: 'TRY', name: 'Turkish Lira',   symbolAr: '₺',  isActive: true, rate: 1 },
      { code: 'EGP', name: 'Egyptian Pound', symbolAr: '£',  isActive: true, rate: 1 },
      { code: 'SAR', name: 'Saudi Riyal',    symbolAr: '﷼',  isActive: true, rate: 1 },
      { code: 'AED', name: 'UAE Dirham',     symbolAr: 'د.إ', isActive: true, rate: 1 },
      { code: 'SYP', name: 'Syrian Pound',   symbolAr: 'ل.س', isActive: true, rate: 1 },
    ];

    for (const c of defaults) {
      const exists = await this.currenciesRepo.findOne({ where: { tenantId, code: c.code as string } });
      if (!exists) {
        await this.currenciesRepo.save(this.currenciesRepo.create({ ...c, tenantId }));
      }
    }

    return this.findAll(tenantId);
  }
}
