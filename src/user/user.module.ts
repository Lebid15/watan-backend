// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';

import { PriceGroup } from '../products/price-group.entity';
import { CurrenciesModule } from '../currencies/currencies.module'; 
import { NotificationsModule } from '../notifications/notifications.module'; 
import { SiteSetting } from '../admin/site-setting.entity';
import { PagesController } from './pages.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PriceGroup, SiteSetting]),
    CurrenciesModule,
    NotificationsModule,
  ],
  providers: [UserService],
  controllers: [UserController, PagesController],
  exports: [UserService],
})
export class UserModule {}
