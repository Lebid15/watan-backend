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
    // 1️⃣ تحميل متغيرات البيئة بشكل عالمي
    ConfigModule.forRoot({ isGlobal: true }),

    // 2️⃣ ربط قاعدة البيانات باستخدام DATABASE_URL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        if (!databaseUrl) {
          throw new Error('❌ DATABASE_URL is not defined in environment variables');
        }

        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: true, // ⚠️ يفضل تعطيله عند رفع المشروع النهائي
          ssl: {
            rejectUnauthorized: false, // ✅ مهم مع Render
          },
          logging: ['error'], // تسجيل الأخطاء فقط
        };
      },
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
