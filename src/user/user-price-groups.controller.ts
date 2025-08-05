// backend/src/user/user-price-groups.controller.ts
import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('user-price-groups')
export class UserPriceGroupsController {
  constructor(private readonly userService: UserService) {}

  // جلب كل المستخدمين مع مجموعة السعر المرتبطة
@UseGuards(JwtAuthGuard)
@Get('with-price-group')
async getUsersWithPriceGroup() {
  try {
    const result = await this.userService.findAllWithPriceGroup();
    return result;
  } catch (error) {
    console.error('❌ Error in controller /users/with-price-group:', error);
    throw error; // سيرجع الخطأ الحقيقي إلى الفرونت
  }
}


  // تعديل مجموعة السعر لمستخدم
  @UseGuards(JwtAuthGuard)  // ✅ حماية بالـ JWT
  @Patch(':id/price-group')
  async updateUserPriceGroup(
    @Param('id') id: string,
    @Body() body: { priceGroupId: string | null },
  ) {
    const updatedUser = await this.userService.updatePriceGroup(id, body.priceGroupId);
    return updatedUser;
  }
}
