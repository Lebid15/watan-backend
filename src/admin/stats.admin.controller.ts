import { Controller, Get, Param, Query } from '@nestjs/common';
import { StatsAdminService } from './stats.admin.service';

@Controller('admin/stats')
export class StatsAdminController {
  constructor(private readonly statsService: StatsAdminService) {}

  // 📊 جميع المشرفين
  @Get('supervisors')
  async supervisors(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.statsService.getSupervisorsStats(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  // 📑 تفاصيل مشرف واحد
  @Get('supervisors/:id')
  async supervisorDetails(@Param('id') id: string) {
    return this.statsService.getSupervisorDetails(id);
  }

  // 👥 إحصائيات المستخدمين
  @Get('users')
  async users() {
    return this.statsService.getUsersStats();
  }

  // 📦 إحصائيات الطلبات
  @Get('orders')
  async orders() {
    return this.statsService.getOrdersStats();
  }
}
