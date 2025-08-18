// src/codes/codes.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodeItem } from './entities/code-item.entity';

@Injectable()
export class CodesService {
  constructor(
    @InjectRepository(CodeItem)
    private readonly itemRepo: Repository<CodeItem>,
  ) {}

  /** يستهلك أول كود متاح (FIFO) من مجموعة معيّنة ويربطه بالطلب */
  async consumeFirstAvailable(groupId: string, orderId: string) {
    return this.itemRepo.manager.transaction(async (trx) => {
      const repo = trx.getRepository(CodeItem);
      const code = await repo.findOne({
        where: { groupId: groupId as any, status: 'available' },
        order: { createdAt: 'ASC' as any },
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
