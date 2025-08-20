import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogImportService } from '../integrations/catalog-import.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { CreateIntegrationDto } from '../integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '../integrations/dto/update-integration.dto';

@Controller('admin/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersAdminController {
  constructor(
    private readonly catalogImport: CatalogImportService,
    private readonly integrations: IntegrationsService,
  ) {}

  // ===== مزوّدو المطوّر (scope = 'dev') =====

  // إنشاء مزوّد مطوّر
  @Post('dev')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async createDevProvider(@Body() dto: CreateIntegrationDto) {
    const item = await this.integrations.create({ ...dto, scope: 'dev' } as any);
    return { ok: true, item };
  }

  // قائمة مزوّدي المطوّر فقط
  @Get('dev')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async listDevProviders() {
    const all = await this.integrations.list();
    const items = all.filter((x: any) => x.scope === 'dev');
    return { ok: true, items };
  }

  // تعديل مزوّد مطوّر
  @Patch('dev/:id')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async updateDevProvider(@Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    const item = await this.integrations.get(id);
    if (!item || (item as any).scope !== 'dev') {
      throw new BadRequestException('Not a developer provider');
    }
    // لا نسمح بتغيير الـ scope عبر التعديل
    const updated = await this.integrations.updateIntegration(id, { ...dto } as any);
    return { ok: true, item: updated };
  }

  // حذف مزوّد مطوّر
  @Delete('dev/:id')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async deleteDevProvider(@Param('id') id: string) {
    const item = await this.integrations.get(id);
    if (!item || (item as any).scope !== 'dev') {
      throw new BadRequestException('Not a developer provider');
    }
    await this.integrations.deleteIntegration(id);
    return { ok: true };
  }

  // الاستيراد من مزوّد مطوّر محدد
  @Post(':providerId/catalog-import')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async importProviderCatalog(@Param('providerId') providerId: string) {
    const integ = await this.integrations.get(providerId);
    if (!integ || (integ as any).scope !== 'dev') {
      throw new BadRequestException('Provider must be scope=dev');
    }
    const res = await this.catalogImport.importProvider(providerId);
    return { ok: true, providerId, ...res };
  }

  // (اختياري) قائمة مزوّدي المشرف (tenant) للفحص فقط
  @Get('tenant')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async listTenantProviders() {
    const all = await this.integrations.list();
    const items = all.filter((x: any) => x.scope === 'tenant');
    return { ok: true, items };
  }
}
