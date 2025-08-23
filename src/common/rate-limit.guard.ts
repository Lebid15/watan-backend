import { CanActivate, ExecutionContext, Injectable, HttpException, SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';

interface Bucket { count: number; resetAt: number; }

@Injectable()
export class RateLimiterRegistry {
  private buckets = new Map<string, Bucket>();
  touch(key: string, windowMs: number, max: number) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt < now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) throw new HttpException('Rate limit exceeded', 429);
  }
}

export interface RateLimitConfig { windowMs: number; max: number; id: string; }
export const RATE_LIMIT_META_KEY = 'rate_limit_cfg';

export const RateLimit = (cfg: RateLimitConfig) => applyDecorators(
  SetMetadata(RATE_LIMIT_META_KEY, cfg),
  UseGuards(RateLimitGuard),
);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private registry: RateLimiterRegistry) {}
  canActivate(ctx: ExecutionContext): boolean {
    const cfg: RateLimitConfig | undefined = Reflect.getMetadata(RATE_LIMIT_META_KEY, ctx.getHandler())
      || Reflect.getMetadata(RATE_LIMIT_META_KEY, ctx.getClass());
    if (!cfg) return true; // no limit
    const req: any = ctx.switchToHttp().getRequest();
    const ipRaw = (req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'ip:unknown').toString();
    const ip = ipRaw.split(',')[0].trim().toLowerCase();
    const routeId = cfg.id;
    const key = `${routeId}:${ip}`;
    this.registry.touch(key, cfg.windowMs, cfg.max);
    return true;
  }
}
