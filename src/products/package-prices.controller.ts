import {
  Controller,
  Put,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as isUuid } from 'uuid';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';

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
    @Param('id') id: string,
    @Body() body: UpdatePackagePricesDto,
  ) {
    // ✅ تحقق من أن الـ id صحيح
    if (!isUuid(id)) {
      throw new BadRequestException('معرّف الباقة غير صالح');
    }

    // ✅ جلب الباقة
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('الباقة غير موجودة');

    // ✅ تحديث رأس المال
    pkg.capital = body.capital ?? 0;
    await this.packageRepo.save(pkg);

    // ✅ تحديث الأسعار
    if (Array.isArray(body.prices)) {
      await Promise.all(
        body.prices.map(async ({ groupId, price }) => {
          if (!isUuid(groupId)) return;

          // جلب مجموعة الأسعار
          const group = await this.groupRepo.findOne({ where: { id: groupId } });
          if (!group) return;

          // جلب أو إنشاء السعر
          let pkgPrice = await this.priceRepo.findOne({
            where: { package: { id: pkg.id }, priceGroup: { id: group.id } },
            relations: ['package', 'priceGroup'],
          });

          if (!pkgPrice) {
            pkgPrice = this.priceRepo.create({
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

    // ✅ إرجاع الباقة مع الأسعار بعد التحديث
    const updatedPrices = await this.priceRepo.find({
      where: { package: { id: pkg.id } },
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
