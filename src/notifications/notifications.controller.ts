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
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // 🔔 تنبيهات المستخدم الحالي
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async my(@Req() req: any) {
    return this.notifications.findByUser(req.user.id);
  }

  // ✅ تعليم واحد كمقروء (يضبط readAt أيضًا)
  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async readOne(@Param('id') id: string) {
    return this.notifications.markAsRead(id);
  }

  // ✅ تعليم الكل كمقروء (يضبط readAt لكل غير المقروء)
  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async readAll(@Req() req: any) {
    await this.notifications.markAllAsRead(req.user.id);
    return { ok: true };
  }

  // 📣 إعلان عام (مشرف فقط) مع دعم link/channel/priority اختياريًا
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('announce')
  async announce(
    @Body() body: { title?: string; message?: string; link?: string; channel?: 'in_app'|'email'|'sms'; priority?: 'low'|'normal'|'high' },
  ) {
    const title = (body.title ?? '').trim();
    const message = (body.message ?? '').trim();
    if (!title || !message) {
      throw new BadRequestException('العنوان والنص مطلوبان');
    }
    const res = await this.notifications.announceForAll(title, message, {
      link: body.link,
      channel: body.channel,
      priority: body.priority,
    });
    return { ok: true, created: res.count };
  }
  
}
