import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { PasskeysModule } from './auth/passkeys/passkeys.module';
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
import { RateLimiterRegistry, RateLimitGuard } from './common/rate-limit.guard';
import { ErrorsModule } from './dev/errors.module';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './dev/all-exceptions.filter';

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
        console.log('Connecting to database with URL:', databaseUrl);
        if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

        // Some deploys were running compiled JS with NODE_ENV unset -> tried to load *.ts migrations.
        // Detect runtime form: if current file ends with .ts we are in ts-node/dev; otherwise in compiled dist.
        const runningTs = __filename.endsWith('.ts');
        const explicitProd = (config.get<string>('NODE_ENV') || '').toLowerCase() === 'production';
        const isProd = explicitProd || !runningTs; // treat compiled runtime as production even if NODE_ENV missing

        if (!explicitProd && !runningTs) {
          // Helpful hint once.
          console.warn('[TypeORM] NODE_ENV not set to production; inferring production because running from dist.');
        }

        // Auto SSL only when not localhost
        let needSsl = isProd;
        try {
          const u = new URL(databaseUrl);
            if (['localhost', '127.0.0.1'].includes(u.hostname)) needSsl = false;
        } catch (_) {}

        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: false, // never auto-sync; rely on migrations
          migrations: runningTs ? ['src/migrations/*.ts'] : ['dist/migrations/*.js'],
          migrationsRun: process.env.AUTO_MIGRATIONS === 'false' ? false : isProd,
          ssl: needSsl ? { rejectUnauthorized: false } : false,
          extra: needSsl ? { ssl: { rejectUnauthorized: false } } : undefined,
          logging: ['error'],
        };
      },
    }),
    ScheduleModule.forRoot(),
    UserModule,
    AuthModule,
  PasskeysModule,
    AdminModule,
    ProductsModule,
    CurrenciesModule,
    PaymentsModule,
    IntegrationsModule,
    CodesModule,
    TenantsModule,
    AuditModule,
  ErrorsModule,
    TypeOrmModule.forFeature([Tenant, TenantDomain]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    RateLimiterRegistry,
    RateLimitGuard,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
