// src/products/products.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PriceGroupsController } from './price-groups.controller';
import { PackagePricesController } from './package-prices.controller';
import { ProductOrdersController } from './product-orders.controller'; // الطلبات للمستخدم
import { ProductOrdersAdminController } from './product-orders.admin.controller'; // الطلبات للإدمن
import { PriceGroupsService } from './price-groups.service';

import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';
import { User } from '../user/user.entity';
import { ProductOrder } from './product-order.entity';
import { OrderDispatchLog } from './order-dispatch-log.entity';

import { Currency } from '../currencies/currency.entity';

// ✅ نعتمد نسخة PackageRouting الموجودة ضمن integrations فقط
import { PackageRouting } from '../integrations/package-routing.entity';
import { PackageCost } from '../integrations/package-cost.entity';
import { PackageMapping } from '../integrations/package-mapping.entity';

import { NotificationsModule } from '../notifications/notifications.module';
import { IntegrationsModule } from '../integrations/integrations.module';

import { OrdersMonitorService } from './orders-monitor.service';
import { AccountingPeriodsService } from '../accounting/accounting-periods.service'


@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Entities الخاصة بالمنتجات/الطلبات
      Product,
      ProductPackage,
      PackagePrice,
      PriceGroup,
      ProductOrder,
      OrderDispatchLog,

      // المستخدم والعملة للحسابات/الأسعار
      User,
      Currency,

      // كيانات الربط مع المزودين (كلها من مجلد integrations)
      PackageRouting,
      PackageCost,
      PackageMapping,
    ]),

    // الخدمات الخارجية التي نعتمدها داخل ProductsService
    NotificationsModule, // يجب أن يصدّر NotificationsService
    IntegrationsModule,  // يجب أن يصدّر IntegrationsService
  ],
  controllers: [
    ProductsController,
    PriceGroupsController,
    PackagePricesController,
    ProductOrdersController,
    ProductOrdersAdminController,
  ],
  providers: [
    ProductsService,
    PriceGroupsService,
    OrdersMonitorService,
    AccountingPeriodsService, // المراقب الدوري للحالات الخارجية
  ],
  exports: [
    ProductsService,
    AccountingPeriodsService,
  ],
})
export class ProductsModule {}
