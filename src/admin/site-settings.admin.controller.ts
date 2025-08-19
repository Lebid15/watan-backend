import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
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

  @Get('about')    getAbout() { return this.service.get('about'); }
  @Put('about')    setAbout(@Body('value') value: string) { return this.service.set('about', value ?? ''); }

  @Get('infoes')   getInfoes() { return this.service.get('infoes'); }
  @Put('infoes')   setInfoes(@Body('value') value: string) { return this.service.set('infoes', value ?? ''); }
}
