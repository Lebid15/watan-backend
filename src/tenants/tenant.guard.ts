import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Whitelisted public routes (no tenant or auth required)
const PUBLIC_PATHS: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/ready$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/request-password-reset$/,
  /^\/api\/auth\/reset-password$/,
  /^\/api\/auth\/request-email-verification$/,
  /^\/api\/auth\/verify-email$/,
  /^\/api\/auth\/bootstrap-developer$/,
  /^\/api\/auth\/assume-tenant$/,
  /^\/api\/auth\/passkeys\/options\/register$/,
  /^\/api\/auth\/passkeys\/register$/,
  /^\/api\/auth\/passkeys\/options\/login$/,
  /^\/api\/auth\/passkeys\/login$/,
  /^\/api\/docs(\/|$)/,
];

// Routes that still require auth/roles (handled at controller) but do NOT require a tenant context.
// We short‑circuit tenant checks here so developer / instance_owner can manage global dev providers.
const NO_TENANT_REQUIRED_PATHS: RegExp[] = [
  /^\/api\/admin\/providers\/dev(\/|$)/, // list/create/diag/update/delete dev providers
  /^\/api\/admin\/providers\/[^/]+\/catalog-import(\/|$)/, // import catalog for dev provider (global scope)
  /^\/api\/admin\/providers\/import-jobs\/[^/]+$/, // check async import job status
  // Global catalog (developer scope) listing endpoints — read-only, still protected by JwtAuth + Roles(dev/instance_owner)
  /^\/api\/admin\/catalog\/products(\/|$)/, // list products, also covers /products/:id/packages because narrower regex added below
  /^\/api\/admin\/catalog\/products\/[^/]+\/packages$/,
  // Global tenant management (developers / instance_owner need to bootstrap tenants without impersonation)
  /^\/api\/admin\/tenants(\/|$)/,
  // Global stats (developer / instance owner overview)
  /^\/api\/admin\/stats(\/|$)/,
];

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req: any = context.switchToHttp().getRequest();
    const path = req.path || req.url || '';

  if (PUBLIC_PATHS.some(r => r.test(path))) return true;

  // Allow certain global-scope admin routes to pass without tenant; JWT & RolesGuard will run after us.
  if (NO_TENANT_REQUIRED_PATHS.some(r => r.test(path))) return true;

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
