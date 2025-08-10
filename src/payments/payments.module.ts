import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Deposit } from './deposit.entity';
import { PaymentMethod } from './payment-method.entity';
import { DepositsService } from './deposits.service';
import { DepositsController } from './deposits.controller';
import { DepositsAdminController } from './deposits.admin.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsAdminController } from './payment-methods.admin.controller';

import { User } from '../user/user.entity';
import { Currency } from '../currencies/currency.entity';

// ✅ الإضافة الجديدة
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deposit, PaymentMethod, User, Currency]),
    NotificationsModule, // ✅ كي نقدر نحقن NotificationsService
  ],
  controllers: [
    DepositsController,
    DepositsAdminController,
    PaymentMethodsController,
    PaymentMethodsAdminController,
  ],
  providers: [DepositsService, PaymentMethodsService],
})
export class PaymentsModule {}
