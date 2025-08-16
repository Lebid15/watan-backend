import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductOrdersController } from './product-orders.controller';
import { ProductOrdersAdminController } from './product-orders.admin.controller';

import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';
import { User } from '../user/user.entity';
import { ProductOrder } from './product-order.entity';
import { OrderDispatchLog } from './order-dispatch-log.entity';
import { Currency } from '../currencies/currency.entity';

// كيانات الربط (من integrations)
import { PackageRouting } from '../integrations/package-routing.entity';
import { PackageCost } from '../integrations/package-cost.entity';
import { PackageMapping } from '../integrations/package-mapping.entity';

import { NotificationsModule } from '../notifications/notifications.module';
import { IntegrationsModule } from '../integrations/integrations.module';

import { OrdersMonitorService } from './orders-monitor.service';
import { AccountingPeriodsService } from '../accounting/accounting-periods.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductPackage,
      PackagePrice,
      PriceGroup,
      ProductOrder,
      OrderDispatchLog,

      User,
      Currency,

      PackageRouting,
      PackageCost,
      PackageMapping,
    ]),
    NotificationsModule,
    IntegrationsModule,
  ],
  controllers: [
    ProductsController,
    ProductOrdersController,
    ProductOrdersAdminController,
  ],
  providers: [
    ProductsService,
    OrdersMonitorService,
    AccountingPeriodsService,
  ],
  exports: [ProductsService, AccountingPeriodsService],
})
export class ProductsModule {}
