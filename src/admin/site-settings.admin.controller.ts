import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express'; // ✅ type-only
import { SiteSettingsService } from './site-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SiteSettingsAdminController {
  constructor(private readonly service: SiteSettingsService) {}

  private getTenantId(req: Request): string {
    const fromUser = (req as any)?.user?.tenantId as string | undefined;
  const fromTenant = (req as any)?.tenant?.id as string | undefined;
    const fromHeader = (req.headers['x-tenant-id'] as string | undefined) || undefined;
    const fromQuery = (req.query?.tenantId as string | undefined) || undefined;
  const tenantId = fromUser || fromTenant || fromHeader || fromQuery;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return tenantId;
  }

  @Get('about')
  getAbout(@Req() req: Request) {
    return this.service.get(this.getTenantId(req), 'about');
  }

  @Put('about')
  setAbout(@Req() req: Request, @Body('value') value: string) {
    return this.service.set(this.getTenantId(req), 'about', value ?? '');
  }

  @Get('infoes')
  getInfoes(@Req() req: Request) {
    return this.service.get(this.getTenantId(req), 'infoes');
  }

  @Put('infoes')
  setInfoes(@Req() req: Request, @Body('value') value: string) {
    return this.service.set(this.getTenantId(req), 'infoes', value ?? '');
  }
}
