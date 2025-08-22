// src/integrations/integrations.controller.ts
import {
  Body,
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user-role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  /** استخراج tenantId من الطلب (JWT أو الهيدر الاحتياطي) */
  private getTenantId(req: any): string {
  const fromUser = req?.user?.tenantId ?? req?.user?.tenant_id;
  const fromTenant = req?.tenant?.id; // middleware
    const fromHeader =
      req?.headers?.['x-tenant-id'] ??
      req?.headers?.['X-Tenant-Id'] ??
      req?.headers?.['x-tenantid'];
  return String(fromUser ?? fromTenant ?? fromHeader ?? '').trim();
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateIntegrationDto) {
    const tenantId = this.getTenantId(req);
    // أي إنشاء من صفحة المشرف = tenant
    return this.svc.create(tenantId, { ...dto, scope: 'tenant' } as any);
  }

  @Get()
  list(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    // لا نعرض dev هنا
    return this.svc.list(tenantId, 'tenant');
  }

  // ⬇️ جلب مزود واحد بالتعريف
  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.svc.get(id, tenantId);
  }

  // ⬇️ تعديل مزود
  @Put(':id')
  updateOne(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    const tenantId = this.getTenantId(req);
    return this.svc.updateIntegration(id, tenantId, dto as any);
  }

  // ⬇️ حذف مزود
  @Delete(':id')
  deleteOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.svc.deleteIntegration(tenantId, id);
  }

  @Post(':id/test')
  test(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.svc.testConnection(id, tenantId);
  }

  @Post(':id/refresh-balance')
  refresh(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.svc.refreshBalance(id, tenantId);
  }

  @Post(':id/sync-products')
  sync(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.svc.syncProducts(id, tenantId);
  }

  @Post(':id/orders')
  place(@Req() req: any, @Param('id') id: string, @Body() dto: PlaceOrderDto) {
    const tenantId = this.getTenantId(req);
    return this.svc.placeOrder(id, tenantId, dto as any);
  }

  @Get(':id/orders/status')
  status(@Req() req: any, @Param('id') id: string, @Query('ids') ids: string) {
    const tenantId = this.getTenantId(req);
    const arr = (ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.svc.checkOrders(id, tenantId, arr);
  }

  @Get(':id/packages')
  getPackages(@Req() req: any, @Param('id') id: string, @Query('product') product?: string) {
    const tenantId = this.getTenantId(req);
    return this.svc.getIntegrationPackages(id, tenantId, product);
  }

  @Post(':id/packages')
  saveMappings(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { our_package_id: string; provider_package_id: string }[],
  ) {
    const tenantId = this.getTenantId(req);
    return this.svc.savePackageMappings(tenantId, id, body);
  }

  // ===== توجيه الباقات / التكاليف
  @Get('routing/all')
  getRoutingAll(@Req() req: any, @Query('q') q?: string) {
    const tenantId = this.getTenantId(req);
    return this.svc.getRoutingAll(tenantId, q);
  }

  @Post('routing/set')
  setRoutingField(
    @Req() req: any,
    @Body() body: { packageId: string; which: 'primary' | 'fallback'; providerId: string | null },
  ) {
    const tenantId = this.getTenantId(req);
    return this.svc.setRoutingField(tenantId, body.packageId, body.which, body.providerId);
  }

  @Post('provider-cost')
  refreshProviderCost(@Req() req: any, @Body() body: { packageId: string; providerId: string }) {
    const tenantId = this.getTenantId(req);
    return this.svc.refreshProviderCost(tenantId, body.packageId, body.providerId);
  }

  @Post('routing/set-type')
  setRoutingType(
    @Req() req: any,
    @Body() body: { packageId: string; providerType: 'manual' | 'external' | 'internal_codes' },
  ) {
    const tenantId = this.getTenantId(req);
    return this.svc.setRoutingType(tenantId, body.packageId, body.providerType);
  }

  @Post('routing/set-code-group')
  setRoutingCodeGroup(
    @Req() req: any,
    @Body() body: { packageId: string; codeGroupId: string | null },
  ) {
    const tenantId = this.getTenantId(req);
    return this.svc.setRoutingCodeGroup(tenantId, body.packageId, body.codeGroupId);
  }
}
