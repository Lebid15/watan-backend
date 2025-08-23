import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { createHash } from 'crypto';
import { ErrorLog, ErrorLevel, ErrorSource, ErrorStatus } from './error-log.entity';

export interface IngestErrorInput {
  source: ErrorSource;
  level?: ErrorLevel;
  name?: string;
  message: string;
  stack?: string;
  path?: string;
  method?: string;
  userId?: string | null;
  tenantId?: string | null;
  userAgent?: string;
  context?: any;
}

@Injectable()
export class ErrorsService {
  private MAX_STACK = 8000;
  constructor(@InjectRepository(ErrorLog) private repo: Repository<ErrorLog>) {}

  private sanitizeContext(ctx: any) {
    if (!ctx || typeof ctx !== 'object') return undefined;
    const redactedKeys = ['password', 'authorization', 'auth', 'token', 'access_token'];
    const clone: any = {};
    for (const [k, v] of Object.entries(ctx)) {
      if (redactedKeys.includes(k.toLowerCase())) {
        clone[k] = '[REDACTED]';
      } else if (typeof v === 'string' && v.length > 500) {
        clone[k] = v.slice(0, 500) + '...';
      } else {
        clone[k] = v;
      }
    }
    return clone;
  }

  private buildHash(input: IngestErrorInput) {
    return createHash('sha256')
      .update([input.source, input.message, input.name || '', input.path || '', input.stack?.split('\n')[0] || ''].join('|'))
      .digest('hex')
      .slice(0, 64);
  }

  async ingest(input: IngestErrorInput) {
    const level: ErrorLevel = input.level || 'error';
    const stack = input.stack ? input.stack.slice(0, this.MAX_STACK) : null;
    const message = input.message.slice(0, 400);
    const path = input.path ? input.path.slice(0, 300) : undefined;
    const hash = this.buildHash(input);
    const now = new Date();
    let existing = await this.repo.findOne({ where: { hash } });
    if (existing) {
      existing.occurrenceCount += 1;
      existing.lastOccurredAt = now;
      // Optionally update stack if previously empty
      if (!existing.stack && stack) existing.stack = stack;
      await this.repo.save(existing);
      return existing;
    }
    const log = this.repo.create({
      source: input.source,
      level,
      status: 'open',
      name: input.name?.slice(0, 120),
      message,
      stack,
      path,
      method: input.method?.slice(0, 8),
      userId: input.userId || null,
      tenantId: input.tenantId || null,
      userAgent: input.userAgent?.slice(0, 400),
      context: this.sanitizeContext(input.context),
      hash,
      occurrenceCount: 1,
      firstOccurredAt: now,
      lastOccurredAt: now,
    });
    return this.repo.save(log);
  }

  async list(params: {
    q?: string; source?: ErrorSource; level?: ErrorLevel; status?: ErrorStatus; userId?: string; tenantId?: string; from?: Date; to?: Date; skip?: number; take?: number;
  }) {
    const where: FindOptionsWhere<ErrorLog> = {};
    if (params.source) where.source = params.source;
    if (params.level) where.level = params.level;
    if (params.status) where.status = params.status;
    if (params.userId) where.userId = params.userId;
    if (params.tenantId) where.tenantId = params.tenantId;
    // text search naive on message
    let qb = this.repo.createQueryBuilder('e').where('1=1');
    if (where.source) qb.andWhere('e.source = :source', { source: where.source });
    if (where.level) qb.andWhere('e.level = :level', { level: where.level });
    if (where.status) qb.andWhere('e.status = :status', { status: where.status });
    if (where.userId) qb.andWhere('e.userId = :userId', { userId: where.userId });
    if (where.tenantId) qb.andWhere('e.tenantId = :tenantId', { tenantId: where.tenantId });
    if (params.q) qb.andWhere('(e.message ILIKE :q OR e.name ILIKE :q)', { q: `%${params.q}%` });
    if (params.from) qb.andWhere('e.createdAt >= :from', { from: params.from });
    if (params.to) qb.andWhere('e.createdAt <= :to', { to: params.to });
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 200);
    qb.orderBy('e.lastOccurredAt', 'DESC').skip(skip).take(take);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, skip, take };
  }

  async findOne(id: string) { return this.repo.findOne({ where: { id } }); }

  async resolve(id: string) {
    const log = await this.findOne(id);
    if (!log) return null;
    log.status = 'resolved';
    log.resolvedAt = new Date();
    return this.repo.save(log);
  }

  async delete(id: string) { await this.repo.delete(id); }
}
