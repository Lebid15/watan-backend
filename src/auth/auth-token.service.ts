import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthToken } from './auth-token.entity';
import * as crypto from 'crypto';

@Injectable()
export class AuthTokenService {
  constructor(@InjectRepository(AuthToken) private repo: Repository<AuthToken>) {}

  private hash(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /** Create a token and return raw token secret (not stored) */
  async create(userId: string, tenantId: string | null, type: AuthToken['type'], ttlMs: number) {
  // Revoke (soft) previous unused tokens of same type for this user (single active token policy)
  await this.repo.update({ userId, type, usedAt: null } as any, { usedAt: new Date() });
    const raw = crypto.randomBytes(32).toString('base64url');
    const token = this.repo.create({
      userId,
      tenantId: tenantId ?? null,
      type,
      tokenHash: this.hash(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    await this.repo.save(token);
    return { raw, entity: token };
  }

  async consume(raw: string, type: AuthToken['type'], userId?: string) {
    const tokenHash = this.hash(raw);
    const now = new Date();
    const token = await this.repo.findOne({ where: { tokenHash, type } });
    if (!token) return null;
    if (token.expiresAt < now) return null;
    if (token.usedAt) return null;
    if (userId && token.userId !== userId) return null;
    token.usedAt = now;
    await this.repo.save(token);
    return token;
  }
}
