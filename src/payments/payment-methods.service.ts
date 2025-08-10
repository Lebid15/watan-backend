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

  findActive() {
    return this.repo.find({ where: { isActive: true } });
  }

  findAll() {
    return this.repo.find();
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('وسيلة الدفع غير موجودة');
    return item;
  }

  create(dto: CreatePaymentMethodDto) {
    const entity = this.repo.create({
      name: dto.name,
      type: dto.type,
      logoUrl: dto.logoUrl ?? null,
      note: dto.note ?? null,
      isActive: dto.isActive ?? true,
      config: dto.config ?? {},
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    const entity = await this.findOne(id);
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

  async remove(id: string) {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { deleted: true };
  }
}
