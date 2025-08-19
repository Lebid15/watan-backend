import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminController } from './admin.controller';
import { UploadController } from './upload.controller';
import { ReportsAdminController } from './reports.admin.controller';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserModule } from '../user/user.module';

// ⬇️ مهم: استيراد ProductsModule لأنه يصدّر AccountingPeriodsService
import { ProductsModule } from '../products/products.module';

import { ProductOrder } from '../products/product-order.entity';
import { Currency } from '../currencies/currency.entity';
import { User } from '../user/user.entity';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SiteSetting } from './site-setting.entity';
import { SiteSettingsService } from './site-settings.service';
import { SiteSettingsAdminController } from './site-settings.admin.controller';


@Module({
  imports: [
    UserModule,
    ProductsModule,
    IntegrationsModule,
    TypeOrmModule.forFeature([ProductOrder, Currency, User, SiteSetting]),
  ],
  controllers: [AdminController, UploadController, ReportsAdminController, SiteSettingsAdminController],
  providers: [JwtAuthGuard, RolesGuard, SiteSettingsService],
  exports: [SiteSettingsService],
})
export class AdminModule {}
