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
  Req,
} from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { PriceGroupsService } from './price-groups.service';
import { PriceGroup } from './price-group.entity';
import type { Request } from 'express';

@Controller('price-groups')
export class PriceGroupsController {
  constructor(private readonly priceGroupsService: PriceGroupsService) {}

  // ✅ جلب كل مجموعات الأسعار (ضمن نفس الـ tenant)
  @Get()
  async findAll(@Req() req: Request): Promise<PriceGroup[]> {
    const tenantId = (req as any).user?.tenantId as string;
    return this.priceGroupsService.findAll(tenantId);
  }

  // ✅ جلب المستخدمين مع مجموعات الأسعار (ضمن نفس الـ tenant)
  @Get('users')
  async getUsersPriceGroups(@Req() req: Request) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.priceGroupsService.getUsersPriceGroups(tenantId);
  }

  // ✅ إنشاء مجموعة أسعار جديدة
  @Post()
  async create(@Req() req: Request, @Body() body: Partial<PriceGroup>): Promise<PriceGroup> {
    if (!body.name || body.name.trim() === '') {
      throw new BadRequestException('اسم المجموعة مطلوب');
    }
    const tenantId = (req as any).user?.tenantId as string;
    return this.priceGroupsService.create(tenantId, body);
  }

  // ✅ تعديل مجموعة أسعار
  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: Partial<PriceGroup>
  ): Promise<PriceGroup> {
    if (!isUuid(id)) throw new BadRequestException('معرّف المجموعة غير صالح');
    const tenantId = (req as any).user?.tenantId as string;
    const group = await this.priceGroupsService.update(tenantId, id, body);
    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    return group;
  }

  // ✅ حذف مجموعة أسعار
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    if (!isUuid(id)) throw new BadRequestException('معرّف المجموعة غير صالح');
    const tenantId = (req as any).user?.tenantId as string;
    const deleted = await this.priceGroupsService.remove(tenantId, id);
    if (!deleted) throw new NotFoundException('المجموعة غير موجودة');
    return { message: 'تم حذف المجموعة بنجاح' };
  }
}
