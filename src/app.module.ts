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
import { CodesModule } from './codes/codes.module';

@Module({
  imports: [
    // تقديم الملفات الثابتة (تفيد محليًا لو استخدمت تخزين ملفات على القرص)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    // متغيرات البيئة: يقرأ .env.local أولًا ثم .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // إعداد TypeORM مع دعم SSL في الإنتاج (مثل Render)
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
          type: 'postgres' as const,
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: true, // عطّلها في الإنتاج إذا تعتمد على migrations
          // في Render وبعض مزودي Postgres يلزم SSL:
          ssl: isProd ? { rejectUnauthorized: false } : false,
          extra: isProd ? { ssl: { rejectUnauthorized: false } } : undefined,
          logging: ['error'],
        };
      },
    }),

    // للمهام المجدولة إن احتجتها
    ScheduleModule.forRoot(),

    // بقية الموديولات
    UserModule,
    AuthModule,
    AdminModule,
    ProductsModule,
    CurrenciesModule,
    PaymentsModule,
    IntegrationsModule,
    CodesModule,
  ],
})
export class AppModule {}
