import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantDomain } from './tenant-domain.entity';
import { Tenant } from './tenant.entity';

declare module 'http' {
  interface IncomingMessage {
    tenant?: Tenant;
  }
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(TenantDomain) private domains: Repository<TenantDomain>,
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
  ) {}

  async use(req: any, res: any, next: () => void) {
    // استخراج Host من الـ request headers أو من X-Tenant-Host للـ frontend
    const originalHost = req.headers.host;
    const tenantHost = req.headers['x-tenant-host'] || originalHost;
    const host = (tenantHost || '').split(':')[0]; // ex: kadro.localhost
    
    console.log('[MIDDLEWARE] Host:', originalHost, 'X-Tenant-Host:', req.headers['x-tenant-host'], 'Final:', host, 'URL:', req.url);
    
    if (!host) return next();

    // ابحث عن النطاق في tenant_domains
    const domain = await this.domains.findOne({ where: { domain: host } });
    console.log('[MIDDLEWARE] Domain found:', domain ? domain.domain : 'NULL');
    
    if (!domain) return next(); // أو يمكنك رمي NotFoundException

    const tenant = await this.tenants.findOne({ where: { id: domain.tenantId } });
    console.log('[MIDDLEWARE] Tenant found:', tenant ? tenant.name : 'NULL');
    
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Tenant not found or inactive');
    }

    req.tenant = tenant;
    console.log('[MIDDLEWARE] Set tenant:', tenant.name, 'for request');
    next();
  }
}
