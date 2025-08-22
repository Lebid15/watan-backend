// src/products/package-prices.controller.ts
import {
  Controller,
  Put,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as isUuid } from 'uuid';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';
import type { Request } from 'express';

interface UpdatePackagePricesDto {
  capital: number;
  prices: { groupId: string; price: number }[];
}

@Controller('products/packages')
export class PackagePricesController {
  constructor(
    @InjectRepository(ProductPackage)
    private readonly packageRepo: Repository<ProductPackage>,

    @InjectRepository(PackagePrice)
    private readonly priceRepo: Repository<PackagePrice>,

    @InjectRepository(PriceGroup)
    private readonly groupRepo: Repository<PriceGroup>,
  ) {}

  @Put(':id/prices')
  async updatePackagePrices(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdatePackagePricesDto,
  ) {
    const tenantId = (req as any).user?.tenantId as string;

    if (!isUuid(id)) {
      throw new BadRequestException('معرّف الباقة غير صالح');
    }

    // ✅ جلب الباقة ضمن نفس الـ tenant
    const pkg = await this.packageRepo.findOne({ where: { id, tenantId } });
    if (!pkg) throw new NotFoundException('الباقة غير موجودة');

    // ✅ تحديث رأس المال
    pkg.capital = body.capital ?? 0;
    await this.packageRepo.save(pkg);

    // ✅ تحديث الأسعار لكل مجموعة ضمن نفس الـ tenant
    if (Array.isArray(body.prices)) {
      await Promise.all(
        body.prices.map(async ({ groupId, price }) => {
          if (!isUuid(groupId)) return;

          // جلب مجموعة الأسعار ضمن نفس الـ tenant
          const group = await this.groupRepo.findOne({ where: { id: groupId, tenantId } });
          if (!group) return;

          // جلب أو إنشاء السعر (ضمن نفس الـ tenant)
          let pkgPrice = await this.priceRepo.findOne({
            where: { tenantId, package: { id: pkg.id, tenantId }, priceGroup: { id: group.id, tenantId } },
            relations: ['package', 'priceGroup'],
          });

          if (!pkgPrice) {
            pkgPrice = this.priceRepo.create({
              tenantId,
              package: pkg,
              priceGroup: group,
              price,
            });
          } else {
            pkgPrice.price = price;
          }

          await this.priceRepo.save(pkgPrice);
        }),
      );
    }

    const updatedPrices = await this.priceRepo.find({
      where: { tenantId, package: { id: pkg.id, tenantId } },
      relations: ['priceGroup'],
    });

    return {
      success: true,
      packageId: pkg.id,
      capital: pkg.capital,
      prices: updatedPrices.map((p) => ({
        id: p.id,
        price: p.price,
        groupId: p.priceGroup.id,
        groupName: p.priceGroup.name,
      })),
    };
  }
}
