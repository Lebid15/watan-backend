// src/codes/codes.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodeItem } from './entities/code-item.entity';

@Injectable()
export class CodesService {
  constructor(
    @InjectRepository(CodeItem)
    private readonly itemRepo: Repository<CodeItem>,
  ) {}

  /**
   * يستهلك أول كود متاح (FIFO) من مجموعة معيّنة ضمن نفس الـ tenant ويربطه بالطلب
   */
  async consumeFirstAvailable(tenantId: string, groupId: string, orderId: string) {
    if (!tenantId) throw new BadRequestException('Missing tenantId');

    return this.itemRepo.manager.transaction(async (trx) => {
      const repo = trx.getRepository(CodeItem);

      // ابحث عن أقدم كود متاح لهذا الـ tenant وهذه المجموعة مع قفل كتابي
      const code = await repo.findOne({
        where: { tenantId, groupId, status: 'available' } as any,
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!code) return null;

      code.status = 'used';
      code.orderId = orderId as any;
      code.usedAt = new Date();

      return repo.save(code);
    });
  }
}
