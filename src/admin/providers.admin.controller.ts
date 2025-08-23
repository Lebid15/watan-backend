import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogImportService } from '../integrations/catalog-import.service';
import { IntegrationsService, DEV_GLOBAL_TENANT_ID } from '../integrations/integrations.service';
import { CreateIntegrationDto } from '../integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '../integrations/dto/update-integration.dto';

@Controller('admin/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersAdminController {
  constructor(
    private readonly catalogImport: CatalogImportService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** استخراج tenantId من الطلب (JWT أو الهيدر) */
  private getTenantId(req: any): string {
    const fromUser = req?.user?.tenantId ?? req?.user?.tenant_id;
    const fromHeader =
      req?.headers?.['x-tenant-id'] ??
      req?.headers?.['X-Tenant-Id'] ??
      req?.headers?.['x-tenantid'];
    return String(fromUser ?? fromHeader ?? '').trim();
  }

  // ================== مزوّدو المطوّر (scope = 'dev') ==================

  /** إنشاء مزوّد مطوّر (scope=dev) */
  @Post('dev')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async createDevProvider(@Req() _req: any, @Body() dto: CreateIntegrationDto) {
    try {
      console.log('[DEV-PROVIDER][CREATE] incoming dto=', dto);
      const item = await this.integrations.create(DEV_GLOBAL_TENANT_ID, { ...dto, scope: 'dev' } as any);
      console.log('[DEV-PROVIDER][CREATE] created id=', (item as any)?.id);
      return { ok: true, item };
    } catch (e:any) {
      // Unique violation (duplicate name for same tenant/scope)
      if (e?.code === '23505') {
        console.error('[DEV-PROVIDER][CREATE] duplicate name', e?.detail);
        throw new BadRequestException('Provider name already exists');
      }
      // Missing column (old production schema) -> يعاد المحاولة برسالة أوضح
      if (e?.code === '42703') {
        console.error('[DEV-PROVIDER][CREATE] missing column (schema drift)', e?.message);
        throw new BadRequestException('Database schema needs refresh: missing column. Reload backend and retry.');
      }
      console.error('[DEV-PROVIDER][CREATE] failed', e?.code, e?.message);
      throw new BadRequestException('Failed to create provider: ' + (e?.message || 'unknown error'));
    }
  }

  /** قائمة مزوّدي المطوّر فقط */
  @Get('dev')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async listDevProviders() {
    const items = await this.integrations.list(null, 'dev');
    return { ok: true, items };
  }

  /** تعديل مزوّد مطوّر */
  @Patch('dev/:id')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async updateDevProvider(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    // get الآن قد يتطلب tenantId — لكونه dev نمرر null
  const item = await this.integrations.get(id, null);
    if (!item || (item as any).scope !== 'dev') {
      throw new BadRequestException('Not a developer provider');
    }
    // updateIntegration يتطلب (tenantId, id, dto). dev → نمرر null كتنانت محايد
    const updated = await this.integrations.updateIntegration(null, id, { ...dto } as any);
    return { ok: true, item: updated };
  }

  /** حذف مزوّد مطوّر */
  @Delete('dev/:id')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async deleteDevProvider(@Param('id') id: string) {
    // get قد يتطلب tenantId — dev → null
  const item = await this.integrations.get(id, null);
    if (!item || (item as any).scope !== 'dev') {
      throw new BadRequestException('Not a developer provider');
    }
    await this.integrations.deleteIntegration(null, id);
    return { ok: true };
  }

  /** الاستيراد من مزوّد مطوّر محدد */
  @Post(':providerId/catalog-import')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER, UserRole.ADMIN)
  async importProviderCatalog(@Req() req: any, @Param('providerId') providerId: string) {
    const role = req.user?.role;
    const tenantId: string | null = req.tenant?.id ?? req.user?.tenantId ?? null;

    // المطوّر / مالك المنصة: يستورد إلى نطاق dev (بدون tenantId)
    if (role === 'developer' || role === 'instance_owner') {
      const integ = await this.integrations.get(providerId, null);
      if (!integ || (integ as any).scope !== 'dev') {
        throw new BadRequestException('Provider must be scope=dev');
      }
      const res = await this.catalogImport.importProvider(null, providerId);
      return { ok: true, providerId, scope: 'dev', ...res };
    }

    // مسؤول التينانت: يستورد نسخة من مزوّد المطوّر إلى تينانته
    if (role === 'admin') {
      if (!tenantId) throw new BadRequestException('Tenant context missing');
      // نحاول أولاً جلبه كمزوّد مطوّر
      let integ: any;
      try { integ = await this.integrations.get(providerId, null); } catch { /* ignore */ }
      if (!integ || integ.scope !== 'dev') {
        // لو لم يكن dev ربما هو مزود Tenant بالفعل فنستورد مباشرةً في نطاق التينانت
        const res = await this.catalogImport.importProvider(tenantId, providerId);
        return { ok: true, providerId, scope: 'tenant', ...res };
      }
      const res = await this.catalogImport.importDevProviderIntoTenant(providerId, tenantId);
      return { ok: true, providerId, scope: 'tenant', ...res };
    }

    throw new BadRequestException('Unsupported role for import');
  }

  // ================== مزوّدو التينانت (scope = 'tenant') ==================

  /** قائمة مزوّدي المستأجر للفحص */
  @Get('tenant')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async listTenantProviders(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    const items = await this.integrations.list(tenantId, 'tenant');
    return { ok: true, items };
  }
}
