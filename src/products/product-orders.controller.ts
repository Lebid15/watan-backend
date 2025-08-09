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
} from '@nestjs/common';
import type { Request } from 'express';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../user/dto/update-user.dto';

export type OrderStatus = 'pending' | 'approved' | 'rejected';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class ProductOrdersController {
  constructor(private readonly productsService: ProductsService) {}

  /** إنشاء طلب جديد (المستخدم الحالي فقط) */
  @Post()
  async createOrder(
    @Body()
    body: {
      productId: string;
      packageId: string;
      quantity: number;
      userIdentifier?: string;
    },
    @Req() req: Request
  ) {
    const user = req.user as any;

    const order = await this.productsService.createOrder({
      ...body,
      userId: user.id, // 🔒 المستخدم الحقيقي من الـ JWT
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
    };
  }

  /** طلبات المستخدم الحالي فقط */
  @Get('me')
  async getMyOrders(@Req() req: Request) {
    const user = req.user as any;
    // لا نرمي NotFound لو فاضي — نرجّع مصفوفة فاضية
    return this.productsService.getUserOrders(user.id);
  }

  /** (اختياري) طلبات مستخدم محدد — للأدمن فقط */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('user/:userId')
  async getUserOrdersAdmin(@Param('userId') userId: string) {
    return this.productsService.getUserOrders(userId);
  }

  /** كل الطلبات — للأدمن فقط */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  async getAllOrders(@Query('status') status?: string) {
    const valid: OrderStatus[] = ['pending', 'approved', 'rejected'];
    const statusTyped = valid.includes(status as OrderStatus)
      ? (status as OrderStatus)
      : undefined;

    return this.productsService.getAllOrders(statusTyped);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body('status') status: 'approved' | 'rejected') {
    const updated = await this.productsService.updateOrderStatus(id, status);
    return { ok: true, id, status: updated?.status ?? status };
  }
}
