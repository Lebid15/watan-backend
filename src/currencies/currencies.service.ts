import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.entity';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currenciesRepo: Repository<Currency>,
  ) {}

  async findAll(): Promise<Currency[]> {
    return this.currenciesRepo.find();
  }

  async create(currency: Partial<Currency>): Promise<Currency> {
    const newCurrency = this.currenciesRepo.create(currency);
    return this.currenciesRepo.save(newCurrency);
  }

  async update(id: string, currency: Partial<Currency>): Promise<Currency> {
    await this.currenciesRepo.update(id, currency);
    const updated = await this.currenciesRepo.findOneBy({ id });
    if (!updated) {
      throw new NotFoundException(`Currency with id ${id} not found`);
    }
    return updated;
  }

    async remove(id: string): Promise<boolean> {
    const result = await this.currenciesRepo.delete(id);
    if (!result.affected || result.affected === 0) {
        return false;
    }
    return true;
    }
}
