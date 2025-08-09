// src/products/products.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PriceGroupsController } from './price-groups.controller';
import { PackagePricesController } from './package-prices.controller';
import { ProductOrdersController } from './product-orders.controller'; // للطلبات العادية للمستخدم
import { ProductOrdersAdminController } from './product-orders.admin.controller'; // ✅ الكنترولر الإداري الجديد

import { PriceGroupsService } from './price-groups.service';

import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';
import { User } from '../user/user.entity';
import { ProductOrder } from './product-order.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductPackage,
      PackagePrice,
      PriceGroup,
      User,
      ProductOrder,
    ]),
    NotificationsModule,
  ],
  controllers: [
    ProductsController,
    PriceGroupsController,
    PackagePricesController,
    ProductOrdersController,       // الطلبات للمستخدم
    ProductOrdersAdminController,  // ✅ الطلبات للإدمن
  ],
  providers: [
    ProductsService,
    PriceGroupsService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
