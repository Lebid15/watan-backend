// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PriceGroup } from '../products/price-group.entity'; // ✅ استدعاء PriceGroup

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PriceGroup]) // ✅ إضافة PriceGroup هنا
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
