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
    return this.productsService.listOrdersWithPagination({
      ...query,
      // @ts-ignore: خاصية مؤقتة تقرأها service لتصفية الطلبات حسب المستخدم
      userId: user.id,
    } as any);
  }

  /** (اختياري) طلبات مستخدم محدد — للأدمن فقط — مع pagination */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('user/:userId')
  async getUserOrdersAdmin(
    @Param('userId') userId: string,
    @Query() query: ListOrdersDto
  ) {
    return this.productsService.listOrdersWithPagination({
      ...query,
      // @ts-ignore: خاصية مؤقتة تقرأها service
      userId,
    } as any);
  }

  /** كل الطلبات — للأدمن فقط — مع pagination */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  async getAllOrders(@Query() query: ListOrdersDto) {
    // ترجع { items, pageInfo: { nextCursor, hasMore }, meta }
    return this.productsService.listOrdersForAdmin(query);
  }

  /** ✅ تفاصيل طلب للمستخدم الحالي (تشمل الملاحظات والرسائل) */
  @Get(':id')
  async getOrderDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request
  ) {
    const user = req.user as any;
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
      extraField?: string; // جديد
    },
    @Req() req: Request
  ) {
    const user = req.user as any;

    const order = await this.productsService.createOrder({
      ...body,
      userId: user.id, // 🔒 من الـ JWT
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
    @Body('status') status: 'approved' | 'rejected'
  ) {
    const updated = await this.productsService.updateOrderStatus(id, status);
    return { ok: true, id, status: updated?.status ?? status };
  }
}
