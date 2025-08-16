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

  // ✅ جديد: واجهة مع باجينيشن (متوافقة مع الفرونت)
  // GET /notifications/mine?limit=20&cursor=...
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId =
      req.user?.id ?? req.user?.userId ?? req.user?.sub;
    const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
    // تحتاج في الـ service دالة: listMineWithPagination(userId, {limit, cursor})
    return this.notifications.listMineWithPagination(userId, {
      limit,
      cursor: cursor ?? null,
    });
  }

  // 🔔 تنبيهات المستخدم الحالي (متوافق للخلف)
  // ملاحظة: لو أُرسلت بارامترات limit/cursor هنا،
  // نرجّع النتيجة الجديدة {items, pageInfo} بدل المصفوفة فقط
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async my(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId =
      req.user?.id ?? req.user?.userId ?? req.user?.sub;

    if (limitQ || cursor) {
      const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
      return this.notifications.listMineWithPagination(userId, {
        limit,
        cursor: cursor ?? null,
      });
    }

    // السلوك القديم: تعيد مصفوفة فقط
    return this.notifications.findByUser(userId);
  }

  // ✅ alias: نفس mine، يسمح للفرونت يطلب GET /notifications مباشرة
  @UseGuards(JwtAuthGuard)
  @Get()
  async aliasRoot(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId =
      req.user?.id ?? req.user?.userId ?? req.user?.sub;
    const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
    return this.notifications.listMineWithPagination(userId, {
      limit,
      cursor: cursor ?? null,
    });
  }

  // ✅ تعليم واحد كمقروء (يضبط readAt أيضًا)
  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async readOne(@Req() req: any, @Param('id') id: string) {
    // تأكيد الملكية اختياري داخل السيرفس
    // أو تمرير userId لو أردت التحقق هناك
    return this.notifications.markAsRead(id, req.user?.id);
  }

  // ✅ تعليم الكل كمقروء (يضبط readAt لكل غير المقروء)
  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async readAll(@Req() req: any) {
    const userId =
      req.user?.id ?? req.user?.userId ?? req.user?.sub;
    await this.notifications.markAllAsRead(userId);
    return { ok: true };
  }

  // 📣 إعلان عام (مشرف فقط) مع دعم link/channel/priority اختياريًا
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('announce')
  async announce(
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
    const res = await this.notifications.announceForAll(title, message, {
      link: body.link,
      channel: body.channel,
      priority: body.priority,
    });
    return { ok: true, created: res.count };
  }
}
