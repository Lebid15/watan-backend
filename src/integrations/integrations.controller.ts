// src/integrations/integrations.controller.ts
import { Body, Controller, Get, Put, Delete, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Post()
  create(@Body() dto: CreateIntegrationDto) {
    return this.svc.create(dto);
  }

  @Get()
  list() {
    return this.svc.list();
  }

  // ⬇️ جديد: جلب مزود واحد بالتعريف
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.get(id);
  }

  // ⬇️ جديد: تعديل مزود
  @Put(':id')
  updateOne(@Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.svc.updateIntegration(id, dto);
  }

  // ⬇️ جديد: حذف مزود
  @Delete(':id')
  deleteOne(@Param('id') id: string) {
    return this.svc.deleteIntegration(id);
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.svc.testConnection(id);
  }

  @Post(':id/refresh-balance')
  refresh(@Param('id') id: string) {
    return this.svc.refreshBalance(id);
  }

  @Post(':id/sync-products')
  sync(@Param('id') id: string) {
    return this.svc.syncProducts(id);
  }

  @Post(':id/orders')
  place(@Param('id') id: string, @Body() dto: PlaceOrderDto) {
    return this.svc.placeOrder(id, dto);
  }

  @Get(':id/orders/status')
  status(@Param('id') id: string, @Query('ids') ids: string) {
    const arr = (ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.svc.checkOrders(id, arr);
  }

  @Get(':id/packages')
  getPackages(@Param('id') id: string, @Query('product') product?: string) {
    return this.svc.getIntegrationPackages(id, product);
  }

  @Post(':id/packages')
  saveMappings(
    @Param('id') id: string,
    @Body() body: { our_package_id: string; provider_package_id: string }[],
  ) {
    return this.svc.savePackageMappings(id, body);
  }

  // ===== توجيه الباقات / التكاليف
  @Get('routing/all')
  getRoutingAll(@Query('q') q?: string) {
    return this.svc.getRoutingAll(q);
  }

  @Post('routing/set')
  setRoutingField(
    @Body() body: { packageId: string; which: 'primary' | 'fallback'; providerId: string | null },
  ) {
    return this.svc.setRoutingField(body.packageId, body.which, body.providerId);
  }

  @Post('provider-cost')
  refreshProviderCost(@Body() body: { packageId: string; providerId: string }) {
    return this.svc.refreshProviderCost(body.packageId, body.providerId);
  }
}
