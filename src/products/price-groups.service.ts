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

  // ✅ إرجاع كل مجموعات الأسعار
  async findAll(): Promise<PriceGroup[]> {
    return this.priceGroupRepo.find();
  }

  // ✅ إنشاء مجموعة جديدة
  async create(data: Partial<PriceGroup>): Promise<PriceGroup> {
    const group = this.priceGroupRepo.create(data);
    return await this.priceGroupRepo.save(group);
  }

  // ✅ تحديث مجموعة حسب ID
  async update(id: string, data: Partial<PriceGroup>): Promise<PriceGroup | null> {
    const group = await this.priceGroupRepo.findOne({ where: { id } });
    if (!group) return null;
    Object.assign(group, data);
    return await this.priceGroupRepo.save(group);
  }

  // ✅ حذف مجموعة ويعيد true/false حسب نجاح العملية
  async remove(id: string): Promise<boolean> {
    const result = await this.priceGroupRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  // ✅ دالة جديدة: جلب مجموعات الأسعار مع المستخدمين المرتبطين
  async getUsersPriceGroups(): Promise<PriceGroup[]> {
    return this.priceGroupRepo.find({
      relations: ['users'], // تأكد أن entity PriceGroup فيه relation users
    });
  }
}
