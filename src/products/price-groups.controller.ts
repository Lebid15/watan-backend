// src/products/price-groups.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { PriceGroupsService } from './price-groups.service';
import { PriceGroup } from './price-group.entity';

@Controller('price-groups')
export class PriceGroupsController {
  constructor(private readonly priceGroupsService: PriceGroupsService) {}

  // ✅ جلب كل مجموعات الأسعار
  @Get()
  async findAll(): Promise<PriceGroup[]> {
    return this.priceGroupsService.findAll();
  }

  // ✅ جلب المستخدمين مع مجموعات الأسعار (مسار ثابت)
  @Get('users')
  async getUsersPriceGroups() {
    // هذه الدالة ستُنفذ من service
    // الهدف: إرجاع كل المستخدمين مع المجموعة المرتبطة بهم
    return this.priceGroupsService.getUsersPriceGroups();
  }

  // ✅ إنشاء مجموعة أسعار جديدة
  @Post()
  async create(@Body() body: Partial<PriceGroup>): Promise<PriceGroup> {
    if (!body.name || body.name.trim() === '') {
      throw new BadRequestException('اسم المجموعة مطلوب');
    }
    return this.priceGroupsService.create(body);
  }

  // ✅ تعديل مجموعة أسعار
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<PriceGroup>
  ): Promise<PriceGroup> {
    if (!isUuid(id)) throw new BadRequestException('معرّف المجموعة غير صالح');
    const group = await this.priceGroupsService.update(id, body);
    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    return group;
  }

  // ✅ حذف مجموعة أسعار
  @Delete(':id')
  async remove(@Param('id') id: string) {
    if (!isUuid(id)) throw new BadRequestException('معرّف المجموعة غير صالح');
    const deleted = await this.priceGroupsService.remove(id);
    if (!deleted) throw new NotFoundException('المجموعة غير موجودة');
    return { message: 'تم حذف المجموعة بنجاح' };
  }
}
