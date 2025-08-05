import { 
  Controller, Post, Body, Get, Param, Query, NotFoundException 
} from '@nestjs/common';
import { ProductsService } from './products.service';

export type OrderStatus = 'pending' | 'approved' | 'rejected';

@Controller('orders')
export class ProductOrdersController {
  constructor(private readonly productsService: ProductsService) {}

  /** 🔹 إنشاء طلب جديد */
  @Post()
  async createOrder(
    @Body() body: { 
      productId: string; 
      packageId: string; 
      quantity: number; 
      userId: string;
      userIdentifier?: string;
    }
  ) {
    const order = await this.productsService.createOrder(body);

    return {
      id: order.id,
      status: order.status,
      price: order.price,
      createdAt: order.createdAt,
      product: { name: order.product?.name ?? '' },
      package: { name: order.package?.name ?? '' },
      userIdentifier: order.userIdentifier ?? null
    };
  }

  /** 🔹 جلب كل طلبات مستخدم */
  @Get('user/:userId')
  async getUserOrders(@Param('userId') userId: string) {
    const orders = await this.productsService.getUserOrders(userId);
    if (!orders.length) throw new NotFoundException('لا توجد طلبات لهذا المستخدم');
    return orders;
  }

  /** 🔹 جلب كل الطلبات مع الفلترة حسب الحالة */
  @Get()
  async getAllOrders(@Query('status') status?: string) {
    const validStatuses: OrderStatus[] = ['pending', 'approved', 'rejected'];
    const statusTyped: OrderStatus | undefined = validStatuses.includes(status as OrderStatus)
      ? (status as OrderStatus)
      : undefined;

    return this.productsService.getAllOrders(statusTyped);
  }

}
