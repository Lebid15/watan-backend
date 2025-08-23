import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ProductsModule } from './products/products.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PaymentsModule } from './payments/payments.module';
import { CodesModule } from './codes/codes.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuditModule } from './audit/audit.module';

import { Tenant } from './tenants/tenant.entity';
import { TenantDomain } from './tenants/tenant-domain.entity';
import { TenantContextMiddleware } from './tenants/tenant-context.middleware';
import { HealthController } from './health/health.controller';
import { TenantGuard } from './tenants/tenant.guard';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        console.log("Connecting to database with URL:", databaseUrl);  // Check the DB URL here
        if (!databaseUrl) {
          throw new Error('DATABASE_URL is not defined');
        }
        const nodeEnv = config.get<string>('NODE_ENV') || 'development';
        const isProd = nodeEnv === 'production';
        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: !isProd,
          ssl: isProd ? { rejectUnauthorized: false } : false,
          extra: isProd ? { ssl: { rejectUnauthorized: false } } : undefined,
          logging: ['error'],
        };
      },
    }),
    ScheduleModule.forRoot(),
    UserModule,
    AuthModule,
    AdminModule,
    ProductsModule,
    CurrenciesModule,
    PaymentsModule,
    IntegrationsModule,
    CodesModule,
    TenantsModule,
    AuditModule,
    TypeOrmModule.forFeature([Tenant, TenantDomain]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
