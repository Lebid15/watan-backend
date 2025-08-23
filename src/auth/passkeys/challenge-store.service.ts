import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
let Redis: any; try { Redis = require('ioredis'); } catch {}

interface StoredChallenge { challenge: string; expiresAt: number; type: 'reg' | 'auth'; userId?: string; }

@Injectable()
export class PasskeyChallengeStore {
  private readonly log = new Logger(PasskeyChallengeStore.name);
  private memory = new Map<string, StoredChallenge>();
  private redis: any = null;
  private ttlMs = 5 * 60 * 1000;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url && Redis) {
      this.redis = new Redis(url, { lazyConnect: true });
      this.redis.on('error', (e: any) => this.log.warn('Redis error: ' + e?.message));
      this.redis.connect().catch(()=>{});
    }
    // periodic cleanup
    setInterval(()=> this.cleanup(), 60_000).unref();
  }

  private key(k: string) { return `passkey:challenge:${k}`; }

  async create(type: 'reg'|'auth', userId?: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const data: StoredChallenge = { challenge, expiresAt: Date.now() + this.ttlMs, type, userId };
    const id = crypto.randomUUID();
    if (this.redis) {
      await this.redis.set(this.key(id), JSON.stringify(data), 'PX', this.ttlMs);
    } else {
      this.memory.set(id, data);
    }
    return `${id}.${challenge}`; // composite given to client (id embedded)
  }

  async consume(composite: string, expectedType: 'reg'|'auth', userId?: string): Promise<string | null> {
    if (!composite || !composite.includes('.')) return null;
    const [id, providedChallenge] = composite.split('.',2);
    let stored: StoredChallenge | null = null;
    if (this.redis) {
      const raw = await this.redis.get(this.key(id));
      if (raw) stored = JSON.parse(raw);
      if (raw) await this.redis.del(this.key(id));
    } else {
      stored = this.memory.get(id) || null;
      if (stored) this.memory.delete(id);
    }
    if (!stored) return null;
    if (stored.type !== expectedType) return null;
    if (Date.now() > stored.expiresAt) return null;
    if (userId && stored.userId && stored.userId !== userId) return null;
    if (stored.challenge !== providedChallenge) return null;
    return stored.challenge;
  }

  // New flow: client sends back only an opaque id (challengeRef). We return stored challenge for verification.
  async consumeById(id: string, expectedType: 'reg'|'auth', userId?: string): Promise<string | null> {
    if (!id) return null;
    let stored: StoredChallenge | null = null;
    if (this.redis) {
      const raw = await this.redis.get(this.key(id));
      if (raw) stored = JSON.parse(raw);
      if (raw) await this.redis.del(this.key(id));
    } else {
      stored = this.memory.get(id) || null;
      if (stored) this.memory.delete(id);
    }
    if (!stored) return null;
    if (stored.type !== expectedType) return null;
    if (Date.now() > stored.expiresAt) return null;
    if (userId && stored.userId && stored.userId !== userId) return null;
    return stored.challenge;
  }

  private cleanup() {
    const now = Date.now();
    for (const [k,v] of this.memory.entries()) {
      if (v.expiresAt < now) this.memory.delete(k);
    }
  }
}
