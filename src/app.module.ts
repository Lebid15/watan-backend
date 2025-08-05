import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ProductsModule } from './products/products.module';
import { CurrenciesModule } from './currencies/currencies.module';

@Module({
  imports: [
    // 1️⃣ تحميل .env بشكل عالمي
    ConfigModule.forRoot({ isGlobal: true }),

    // 2️⃣ ربط قاعدة البيانات ديناميكيًا مع .env
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: true,
        logging: ['error'],
      }),
    }),

    // 3️⃣ باقي الموديولات
    UserModule,
    AuthModule,
    AdminModule,
    ProductsModule,
    CurrenciesModule,
  ],
})
export class AppModule {}
