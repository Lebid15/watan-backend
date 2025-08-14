import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ProductsModule } from './products/products.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    // تقديم الملفات الثابتة (لرفع الملفات محليًا عند التطوير)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    // متغيرات البيئة
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'development' ? '.env.local' : '.env',
    }),

    // إعداد TypeORM مع دعم Render و SSL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

        const nodeEnv = config.get<string>('NODE_ENV') || 'production';
        const isProd = nodeEnv === 'production';

        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: true, // عطّلها في الإنتاج إذا تستخدم migrations
          ssl: isProd ? { rejectUnauthorized: false } : false,
          extra: isProd ? { ssl: { rejectUnauthorized: false } } : undefined,
          logging: ['error'],
        };
      },
    }),

    // ✅ Scheduler لاستخدام polling لاحقًا
    ScheduleModule.forRoot(),

    // الموديولات
    UserModule,
    AuthModule,
    AdminModule,
    ProductsModule,
    CurrenciesModule,
    PaymentsModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
