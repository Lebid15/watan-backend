import { Controller, Get, Patch, Param, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('user-price-groups')
@UseGuards(JwtAuthGuard)
export class UserPriceGroupsController {
  constructor(private readonly userService: UserService) {}

  // جلب كل المستخدمين مع مجموعة السعر المرتبطة
  @Get('with-price-group')
  async getUsersWithPriceGroup(@Req() req) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant ID is missing from token');

    return this.userService.findAllWithPriceGroup(tenantId);
  }

  // تعديل مجموعة السعر لمستخدم
  @Patch(':id/price-group')
  async updateUserPriceGroup(
    @Param('id') id: string,
    @Body() body: { priceGroupId: string | null },
    @Req() req,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant ID is missing from token');

    return this.userService.updateUserPriceGroup(id, body.priceGroupId, tenantId);
  }
}
