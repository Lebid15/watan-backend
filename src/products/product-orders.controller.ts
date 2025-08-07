// src/products/product-orders.controller.ts

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

export type OrderStatus = 'pending' | 'approved' | 'rejected';

// ✅ حماية كل المسارات بتوكن JWT
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class ProductOrdersController {
  constructor(private readonly productsService: ProductsService) {}

  /** 🔹 إنشاء طلب جديد */
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
      userId: user.id, // ✅ ضمان استخدام المستخدم الحقيقي فقط
    });

    return {
      id: order.id,
      status: order.status,
      price: order.price,
      createdAt: order.createdAt,
      product: { name: order.product?.name ?? '' },
      package: { name: order.package?.name ?? '' },
      userIdentifier: order.userIdentifier ?? null,
    };
  }

  /** 🔹 جلب كل طلبات مستخدم محدد */
  @Get('user/:userId')
  async getUserOrders(@Param('userId') userId: string) {
    const orders = await this.productsService.getUserOrders(userId);
    if (!orders.length) throw new NotFoundException('لا توجد طلبات لهذا المستخدم');
    return orders;
  }

  /** 🔹 جلب كل الطلبات (للأدمن) مع إمكانية التصفية حسب الحالة */
  @Get()
  async getAllOrders(@Query('status') status?: string) {
    const validStatuses: OrderStatus[] = ['pending', 'approved', 'rejected'];
    const statusTyped: OrderStatus | undefined = validStatuses.includes(
      status as OrderStatus
    )
      ? (status as OrderStatus)
      : undefined;

    return this.productsService.getAllOrders(statusTyped);
  }
}
