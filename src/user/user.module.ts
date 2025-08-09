// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PriceGroup } from '../products/price-group.entity';
import { CurrenciesModule } from '../currencies/currencies.module'; // ✅ استيراد موديول العملات

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PriceGroup]), // ✅ مستودع المستخدم ومجموعة الأسعار
    CurrenciesModule, // ✅ استيراد موديول العملات للحصول على CurrencyRepository
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
