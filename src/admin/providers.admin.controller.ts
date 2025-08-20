import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogImportService } from '../integrations/catalog-import.service';

@Controller('admin/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersAdminController {
  constructor(private readonly catalogImport: CatalogImportService) {}

  @Post(':providerId/catalog-import')
  @Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
  async importProviderCatalog(@Param('providerId') providerId: string) {
    const res = await this.catalogImport.importProvider(providerId);
    return { ok: true, providerId, ...res };
  }
}
