// src/notifications/notifications.controller.ts
import {
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // ✅ واجهة مع باجينيشن
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    const tenantId = req.user?.tenantId;
    const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
    return this.notifications.listMineWithPagination(
      userId,
      tenantId,
      { limit, cursor: cursor ?? null },
    );
  }

  // 🔔 تنبيهات المستخدم الحالي (قديم + دعم pagination)
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async my(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    const tenantId = req.user?.tenantId;

    if (limitQ || cursor) {
      const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
      return this.notifications.listMineWithPagination(
        userId,
        tenantId,
        { limit, cursor: cursor ?? null },
      );
    }

    return this.notifications.findByUser(userId, tenantId);
  }

  // ✅ alias: نفس mine
  @UseGuards(JwtAuthGuard)
  @Get()
  async aliasRoot(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    const tenantId = req.user?.tenantId;
    const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
    return this.notifications.listMineWithPagination(
      userId,
      tenantId,
      { limit, cursor: cursor ?? null },
    );
  }

  // ✅ تعليم واحد كمقروء
  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async readOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId;
    return this.notifications.markAsRead(id, req.user?.id, tenantId);
  }

  // ✅ تعليم الكل كمقروء
  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async readAll(@Req() req: any) {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    const tenantId = req.user?.tenantId;
    await this.notifications.markAllAsRead(userId, tenantId);
    return { ok: true };
  }

  // 📣 إعلان عام (مشرف فقط)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('announce')
  async announce(
    @Req() req: any,
    @Body()
    body: {
      title?: string;
      message?: string;
      link?: string;
      channel?: 'in_app' | 'email' | 'sms';
      priority?: 'low' | 'normal' | 'high';
    },
  ) {
    const title = (body.title ?? '').trim();
    const message = (body.message ?? '').trim();
    if (!title || !message) {
      throw new BadRequestException('العنوان والنص مطلوبان');
    }
    const tenantId = req.user?.tenantId;
    const res = await this.notifications.announceForAll(
      tenantId,
      title,
      message,
      {
        link: body.link,
        channel: body.channel,
        priority: body.priority,
      },
    );
    return { ok: true, created: res.count };
  }
}
