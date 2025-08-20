// products/price-groups.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceGroup } from './price-group.entity';

@Injectable()
export class PriceGroupsService {
  constructor(
    @InjectRepository(PriceGroup)
    private readonly priceGroupRepo: Repository<PriceGroup>,
  ) {}
  async findAll(): Promise<PriceGroup[]> {
    const groups = await this.priceGroupRepo.find();
    return groups;
  }
  async create(data: Partial<PriceGroup>): Promise<PriceGroup> {
    const group = this.priceGroupRepo.create(data);
    const saved = await this.priceGroupRepo.save(group);
    return saved;
  }
  async update(id: string, data: Partial<PriceGroup>): Promise<PriceGroup | null> {
    const group = await this.priceGroupRepo.findOne({ where: { id } });
    if (!group) {
      return null;
    }
    Object.assign(group, data);
    const saved = await this.priceGroupRepo.save(group);
    return saved;
  }
  async remove(id: string): Promise<boolean> {
    const result = await this.priceGroupRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }
  async getUsersPriceGroups(): Promise<PriceGroup[]> {
    const groups = await this.priceGroupRepo.find({
      relations: ['users'], 
    });
    return groups;
  }
}
