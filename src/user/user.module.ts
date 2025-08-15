// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';

import { PriceGroup } from '../products/price-group.entity';
import { CurrenciesModule } from '../currencies/currencies.module'; // ✅ باقٍ كما هو
import { NotificationsModule } from '../notifications/notifications.module'; // ✅ جديد

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PriceGroup]),
    CurrenciesModule,       // يوفر عملة/أسعار الصرف كما كنت تعمل
    NotificationsModule,    // ✅ ضروري لحقن NotificationsService في UserService
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
