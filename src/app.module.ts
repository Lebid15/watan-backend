import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ProductsModule } from './products/products.module';
import { CurrenciesModule } from './currencies/currencies.module';

@Module({
  imports: [
    // 1️⃣ تقديم الملفات الثابتة من مجلد uploads عبر المسار /uploads
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    // 2️⃣ تحميل متغيرات البيئة حسب الأولوية
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // 3️⃣ إعداد TypeORM بالاتصال حسب بيئة التشغيل
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        if (!databaseUrl) {
          throw new Error('DATABASE_URL is not defined');
        }

        const nodeEnv = config.get<string>('NODE_ENV') || 'production';
        const isProd = nodeEnv === 'production';

        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: true, // عطلها في الإنتاج إن كنت تريد
          ssl: isProd
            ? { rejectUnauthorized: false }
            : false,
          logging: ['error'],
        };
      },
    }),

    // 4️⃣ الموديولات الأخرى
    UserModule,
    AuthModule,
    AdminModule,
    ProductsModule,
    CurrenciesModule,
  ],
})
export class AppModule {}
