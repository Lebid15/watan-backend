import { 
  Controller, Get, Param, Patch, Body, NotFoundException, UseGuards 
} from '@nestjs/common';
import { ProductsService, OrderStatus } from './products.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../auth/user-role.enum';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) // ✅ الحل هنا
export class ProductOrdersAdminController {
  constructor(private readonly productsService: ProductsService) {}

  /** 🔹 جلب كل الطلبات */
  @Get()
  async getAllOrders() {
    return this.productsService.getAllOrders();
  }

  /** 🔹 تحديث حالة الطلب (قبول / رفض) */
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status: OrderStatus }
  ) {
    const { status } = body;
    if (!['approved', 'rejected'].includes(status)) {
      throw new NotFoundException('الحالة غير صحيحة');
    }

    const order = await this.productsService.updateOrderStatus(id, status);
    if (!order) throw new NotFoundException('الطلب غير موجود');

    return { message: 'تم تحديث حالة الطلب بنجاح', order };
  }
}
