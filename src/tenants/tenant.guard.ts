import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Whitelisted public routes (no tenant or auth required)
const PUBLIC_PATHS: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/ready$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/password\//,
  /^\/api\/auth\/bootstrap-developer$/,
  /^\/api\/auth\/assume-tenant$/,
  /^\/api\/docs(\/|$)/,
];

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req: any = context.switchToHttp().getRequest();
    const path = req.path || req.url || '';

    if (PUBLIC_PATHS.some(r => r.test(path))) return true;

    // JWT user injected by auth guard earlier (assume global order: auth -> tenant guard) or manually attached.
    const user = req.user;
    const tenant = req.tenant;

    // Must have tenant context for any protected route unless elevated WITHOUT impersonation is still global (no tenant access)
    if (!tenant) throw new UnauthorizedException('Tenant context required');

    if (!user) throw new UnauthorizedException('Auth required');

    // Developer/instance_owner may have user.tenantId null, but once accessing tenant route ensure impersonation (tenantId present in token)
    if ((user.role === 'developer' || user.role === 'instance_owner')) {
      if (!user.tenantId || user.tenantId !== tenant.id) {
        // Not impersonated properly
        throw new ForbiddenException('Impersonation required for tenant access');
      }
    } else {
      // Regular user must match tenant
      if (user.tenantId !== tenant.id) {
        throw new ForbiddenException('Cross-tenant access blocked');
      }
    }
    return true;
  }
}
