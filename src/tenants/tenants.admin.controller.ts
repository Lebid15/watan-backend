import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user-role.enum';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { AddDomainDto } from './dto/add-domain.dto';
import { PatchDomainDto } from './dto/patch-domain.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
// لا نضع "api/" هنا لأننا نستخدم setGlobalPrefix('api') في main.ts
@Controller('admin/tenants')
export class TenantsAdminController {
  constructor(private readonly svc: TenantsService) {}

  // Tenants
  @Get()
  list() {
    return this.svc.listTenants();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.svc.createTenant(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getTenant(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.svc.updateTenant(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.deleteTenant(id);
  }

  // Domains
  @Get(':id/domains')
  listDomains(@Param('id') tenantId: string) {
    return this.svc.listDomains(tenantId);
  }

  @Post(':id/domains')
  addDomain(@Param('id') tenantId: string, @Body() dto: AddDomainDto) {
    return this.svc.addDomain(tenantId, dto);
  }

  @Patch(':id/domains/:domainId')
  patchDomain(
    @Param('id') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() dto: PatchDomainDto,
  ) {
    return this.svc.patchDomain(tenantId, domainId, dto);
  }

  @Delete(':id/domains/:domainId')
  deleteDomain(@Param('id') tenantId: string, @Param('domainId') domainId: string) {
    return this.svc.deleteDomain(tenantId, domainId);
  }

  // Utilities
  @Post(':id/reset-owner-password')
  resetOwnerPassword(@Param('id') tenantId: string) {
    return this.svc.resetOwnerPassword(tenantId);
  }
}
