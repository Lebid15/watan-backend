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
import { DataSource } from 'typeorm';

@Controller('admin/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersAdminController {
  constructor(
    private readonly catalogImport: CatalogImportService,
    private readonly integrations: IntegrationsService,
  private readonly dataSource: DataSource,
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
  async listDevProviders(@Req() req: any) {
    const items = await this.integrations.list(null, 'dev');
    return { ok: true, items };
  }

  /** تشخيص: عرض أعمدة جدول integrations للتأكد من نشر العمود scope وغيره */
  @Get('dev/diag')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async diagIntegrations() {
    try {
      const cols = await this.dataSource.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='integrations' ORDER BY column_name`);
      return { ok: true, columns: cols };
    } catch (e:any) {
      return { ok: false, error: e?.message || String(e) };
    }
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
  console.log(`[CatalogImport][Controller] START providerId=${providerId} role=${role} tenantId=${tenantId || 'null'}`);

    // المطوّر / مالك المنصة: يستورد إلى نطاق dev (بدون tenantId)
    if (role === 'developer' || role === 'instance_owner') {
      const integ = await this.integrations.get(providerId, null);
      if (!integ || (integ as any).scope !== 'dev') {
        throw new BadRequestException('Provider must be scope=dev');
      }
  const res = await this.catalogImport.importProvider(null, providerId);
  console.log(`[CatalogImport][Controller] DONE providerId=${providerId} scope=dev ms=${res.ms}`);
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
        console.log(`[CatalogImport][Controller] DONE providerId=${providerId} scope=tenant-direct ms=${res.ms}`);
        return { ok: true, providerId, scope: 'tenant', ...res };
      }
      const res = await this.catalogImport.importDevProviderIntoTenant(providerId, tenantId);
      console.log(`[CatalogImport][Controller] DONE providerId=${providerId} scope=tenant-cloned ms=${res.ms}`);
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

  /** تشغيل الاستيراد بالخلفية وإرجاع jobId فوري (مبدئي بسيط داخل الذاكرة) */
  private static pendingJobs: Record<string, any> = {};
  @Post(':providerId/catalog-import/async')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER, UserRole.ADMIN)
  async importProviderCatalogAsync(@Req() req: any, @Param('providerId') providerId: string) {
    const role = req.user?.role;
    const tenantId: string | null = req.tenant?.id ?? req.user?.tenantId ?? null;
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    ProvidersAdminController.pendingJobs[jobId] = { status: 'running', startedAt: Date.now() };
    setImmediate(async () => {
      try {
        const res = await this.importProviderCatalog(req, providerId);
        ProvidersAdminController.pendingJobs[jobId] = { status: 'done', finishedAt: Date.now(), result: res };
      } catch (e:any) {
        ProvidersAdminController.pendingJobs[jobId] = { status: 'error', finishedAt: Date.now(), error: e?.message || String(e) };
      }
    });
    return { ok: true, jobId };
  }

  /** فحص حالة job async */
  @Get('import-jobs/:jobId')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER, UserRole.ADMIN)
  async getImportJob(@Param('jobId') jobId: string) {
    const j = ProvidersAdminController.pendingJobs[jobId];
    if (!j) return { ok: false, error: 'job not found' };
    return { ok: true, job: j };
  }
}
