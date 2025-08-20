import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { AdminController } from './admin.controller';
import { UploadController } from './upload.controller';
import { ReportsAdminController } from './reports.admin.controller';
import { SiteSettingsAdminController } from './site-settings.admin.controller';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

import { UserModule } from '../user/user.module';
import { ProductsModule } from '../products/products.module';

import { ProductOrder } from '../products/product-order.entity';
import { Currency } from '../currencies/currency.entity';
import { User } from '../user/user.entity';

import { IntegrationsModule } from '../integrations/integrations.module';
import { Integration } from '../integrations/integration.entity';

import { SiteSetting } from './site-setting.entity';
import { SiteSettingsService } from './site-settings.service';

// Catalog
import { CatalogProduct } from '../catalog/catalog-product.entity';
import { CatalogPackage } from '../catalog/catalog-package.entity';
import { CatalogAdminController } from './catalog.admin.controller';
import { ProvidersAdminController } from './providers.admin.controller';
import { CatalogImportService } from '../integrations/catalog-import.service';

// ⬅️ مهم: كيانات المتجر
import { Product } from '../products/product.entity';
import { ProductPackage } from '../products/product-package.entity';

@Module({
  imports: [
    UserModule,
    ProductsModule,
    IntegrationsModule,
    HttpModule,
    TypeOrmModule.forFeature([
      ProductOrder,
      Currency,
      User,
      SiteSetting,
      CatalogProduct,
      CatalogPackage,
      Integration,
      // ⬇️ إضافة ضرورية لحل الخطأ
      Product,
      ProductPackage,
    ]),
  ],
  controllers: [
    AdminController,
    UploadController,
    ReportsAdminController,
    SiteSettingsAdminController,
    CatalogAdminController,
    ProvidersAdminController,
  ],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    SiteSettingsService,
    CatalogImportService,
  ],
  exports: [SiteSettingsService],
})
export class AdminModule {}
