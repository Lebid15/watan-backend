import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) {}

  async log(eventType: string, params: {
    actorUserId?: string | null;
    targetUserId?: string | null;
    targetTenantId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    meta?: Record<string, any> | null;
  }) {
    const entry = this.repo.create({ eventType, ...params });
    await this.repo.save(entry);
    return entry.id;
  }
}
