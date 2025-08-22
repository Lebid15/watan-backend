// backend/src/payments/payment-methods.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod) private repo: Repository<PaymentMethod>,
  ) {}

  /** إرجاع الوسائل المفعلة لمستأجر محدد */
  findActive(tenantId: string) {
    return this.repo.find({ where: { isActive: true, tenantId } });
  }

  /** إرجاع كل الوسائل لمستأجر محدد */
  findAll(tenantId: string) {
    return this.repo.find({ where: { tenantId } });
  }

  /** إرجاع عنصر واحد مع فرض المستأجر */
  async findOne(id: string, tenantId: string) {
    const item = await this.repo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('وسيلة الدفع غير موجودة');
    return item;
  }

  /** إنشاء وسيلة دفع مع ضبط tenantId */
  create(tenantId: string, dto: CreatePaymentMethodDto) {
    const entity = this.repo.create({
      tenantId,
      name: dto.name,
      type: dto.type,
      logoUrl: dto.logoUrl ?? null,
      note: dto.note ?? null,
      isActive: dto.isActive ?? true,
      config: dto.config ?? {},
    });
    return this.repo.save(entity);
  }

  /** تحديث وسيلة دفع مع فرض المستأجر */
  async update(id: string, tenantId: string, dto: UpdatePaymentMethodDto) {
    const entity = await this.findOne(id, tenantId);
    Object.assign(entity, {
      name: dto.name ?? entity.name,
      type: dto.type ?? entity.type,
      logoUrl: dto.logoUrl ?? entity.logoUrl,
      note: dto.note ?? entity.note,
      isActive: dto.isActive ?? entity.isActive,
      config: dto.config ?? entity.config,
    });
    return this.repo.save(entity);
  }

  /** حذف وسيلة دفع مع فرض المستأجر */
  async remove(id: string, tenantId: string) {
    const entity = await this.findOne(id, tenantId);
    await this.repo.remove(entity);
    return { deleted: true };
  }
}
