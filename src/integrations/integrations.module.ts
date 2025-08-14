import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { Integration } from './integration.entity';
import { PackageMapping } from './package-mapping.entity';

import { BarakatProvider } from './providers/barakat.provider';
import { ZnetProvider } from './providers/znet.provider';

import { Product } from '../products/product.entity';
import { ProductPackage } from '../products/product-package.entity';

// ✅ كيانات التوجيه والتكلفة
import { PackageRouting } from './package-routing.entity';
import { PackageCost } from './package-cost.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      Integration,
      PackageMapping,
      Product,
      ProductPackage,
      PackageRouting,
      PackageCost,
    ]),
  ],
  controllers: [
    // احذف هذا السطر لو ما عندك كنترولر فعليًا
    IntegrationsController,
  ],
  providers: [
    IntegrationsService,
    BarakatProvider,
    ZnetProvider,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
