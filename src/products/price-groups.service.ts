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

  async findAll(tenantId: string): Promise<PriceGroup[]> {
    return this.priceGroupRepo.find({
      where: { tenantId },
    });
  }

  async create(tenantId: string, data: Partial<PriceGroup>): Promise<PriceGroup> {
    const group = this.priceGroupRepo.create({ ...data, tenantId });
    return this.priceGroupRepo.save(group);
  }

  async update(tenantId: string, id: string, data: Partial<PriceGroup>): Promise<PriceGroup | null> {
    const group = await this.priceGroupRepo.findOne({ where: { id, tenantId } });
    if (!group) return null;

    Object.assign(group, data);
    return this.priceGroupRepo.save(group);
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const result = await this.priceGroupRepo.delete({ id, tenantId });
    return (result.affected ?? 0) > 0;
  }

  async getUsersPriceGroups(tenantId: string): Promise<PriceGroup[]> {
    return this.priceGroupRepo.find({
      where: { tenantId },
      relations: ['users'],
    });
  }
}
