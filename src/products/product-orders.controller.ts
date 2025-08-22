// src/products/product-orders.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  Patch,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { ListOrdersDto } from './dto/list-orders.dto';

export type OrderStatus = 'pending' | 'approved' | 'rejected';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class ProductOrdersController {
  constructor(private readonly productsService: ProductsService) {}

  /** طلبات المستخدم الحالي — الآن مع pagination (items + pageInfo) */
  @Get('me')
  async getMyOrders(@Req() req: Request, @Query() query: ListOrdersDto) {
    const user = req.user as any;
    // ملاحظة: دالة السيرفس تستقبل (dto, tenantId?) لذلك نمرّر tenantId كوسيط ثاني
    // ونكتفي بتمرير userId داخل الـ dto. كان سابقاً يُمرَّر tenantId داخل dto فقط (يُتجاهَل).
    return this.productsService.listOrdersWithPagination(
      {
        ...query,
        // خصائص مؤقتة يقرأها السيرفس للتصفية
        // @ts-ignore
        userId: user.id,
      } as any,
      // @ts-ignore
      user.tenantId,
    );
  }

  /** (اختياري) طلبات مستخدم محدد — للأدمن فقط — مع pagination */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('user/:userId')
  async getUserOrdersAdmin(
    @Param('userId') userId: string,
    @Query() query: ListOrdersDto,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.productsService.listOrdersWithPagination({
      ...query,
      // @ts-ignore
      userId,
      // @ts-ignore
      tenantId: user.tenantId, // ⬅︎ تقييد ضمن تينانت الأدمن
    } as any);
  }

  /** كل الطلبات — للأدمن فقط — مع pagination */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  async getAllOrders(@Query() query: ListOrdersDto, @Req() req: Request) {
    const user = req.user as any;
    // ترجع { items, pageInfo: { nextCursor, hasMore }, meta }
    return this.productsService.listOrdersForAdmin({
      ...query,
      // @ts-ignore
      tenantId: user.tenantId, // ⬅︎ تمرير التينانت للتصفية على مستوى السيرفس
    } as any);
  }

  /** ✅ تفاصيل طلب للمستخدم الحالي (تشمل الملاحظات والرسائل) */
  @Get(':id')
  async getOrderDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    // هنا نستخدم دالة السيرفس القائمة التي تتحقق من أن الطلب يعود لنفس المستخدم
    return this.productsService.getOrderDetailsForUser(id, user.id);
  }

  /** إنشاء طلب جديد (المستخدم الحالي فقط) */
  @Post()
  async createOrder(
    @Body()
    body: {
      productId: string;
      packageId: string;
      quantity: number;
      userIdentifier?: string;
      extraField?: string;
    },
    @Req() req: Request,
  ) {
    const user = req.user as any;

    const order = await this.productsService.createOrder({
      ...body,
      userId: user.id, // 🔒 من الـ JWT
      // tenantId ليس مطلوبًا هنا الآن لأن السيرفس يقتطع من user لاحقًا عند الحاجة
    });

    return {
      id: order.id,
      status: order.status,
      // السعر بالدولار (داخلي)
      priceUSD: order.priceUSD,
      unitPriceUSD: order.unitPriceUSD,
      // السعر المعروض بعملة المستخدم
      display: order.display,
      createdAt: order.createdAt,
      product: { name: order.product?.name ?? '' },
      package: { name: order.package?.name ?? '' },
      userIdentifier: order.userIdentifier ?? null,
      extraField: order.extraField ?? null,
    };
  }

  /** تعديل حالة الطلب — للأدمن */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  async setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: 'approved' | 'rejected',
    @Req() req: Request,
  ) {
    // مبدئيًا لا نتحقق من tenant هنا، سنعتمد على تصفية السيرفس لاحقًا عندما نضيف شرط tenant
    const updated = await this.productsService.updateOrderStatus(id, status);
    return { ok: true, id, status: updated?.status ?? status };
  }
}
