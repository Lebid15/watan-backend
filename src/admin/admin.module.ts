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

@Module({
  imports: [
    UserModule,
    ProductsModule, // ✅ يجعل AccountingPeriodsService متاحًا هنا
    TypeOrmModule.forFeature([ProductOrder, Currency, User]),
  ],
  controllers: [AdminController, UploadController, ReportsAdminController],
  providers: [JwtAuthGuard, RolesGuard],
})
export class AdminModule {}
