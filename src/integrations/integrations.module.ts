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

// ✅ كيانات الأكواد (مطلوبة للـ Repositories)
import { CodeGroup } from '../codes/entities/code-group.entity';
import { CodeItem } from '../codes/entities/code-item.entity';

// (اختياري) إذا كنت تحقن CodesService في أي مكان داخل هذا الموديول
// import { CodesModule } from '../codes/codes.module';

@Module({
  imports: [
    HttpModule,
    // CodesModule, // ← فكّ التعليق إذا كنت تحتاج CodesService كمزوّد
    TypeOrmModule.forFeature([
      Integration,
      PackageMapping,
      Product,
      ProductPackage,
      PackageRouting,
      PackageCost,
      CodeGroup,        
      CodeItem,
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, BarakatProvider, ZnetProvider],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
