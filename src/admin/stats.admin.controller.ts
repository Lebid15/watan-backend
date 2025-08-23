import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { StatsAdminService } from './stats.admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
@Controller('admin/stats')
export class StatsAdminController {
  constructor(private readonly statsService: StatsAdminService) {}

  // 📊 جميع المشرفين
  @Get('supervisors')
  async supervisors(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenantId = req.user?.tenantId;
    return this.statsService.getSupervisorsStats(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      tenantId,
    );
  }

  // 📑 تفاصيل مشرف واحد
  @Get('supervisors/:id')
  async supervisorDetails(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId;
    return this.statsService.getSupervisorDetails(id, tenantId);
  }

  // 👥 إحصائيات المستخدمين
  @Get('users')
  async users(@Req() req: any) {
    const tenantId = req.user?.tenantId;
    return this.statsService.getUsersStats(tenantId);
  }

  // 📦 إحصائيات الطلبات
  @Get('orders')
  async orders(@Req() req: any) {
    const tenantId = req.user?.tenantId;
    return this.statsService.getOrdersStats(tenantId);
  }
}
