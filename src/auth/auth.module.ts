// src/auth/auth.module.ts
import { jwtConstants } from './constants';
import { Module } from '@nestjs/common';
import { RateLimiterRegistry, RateLimitGuard } from '../common/rate-limit.guard';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserModule } from '../user/user.module';  // تأكد من هذا السطر
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../user/user.entity';
import { AuthToken } from './auth-token.entity';
import { AuthTokenService } from './auth-token.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    UserModule,  // مهم جداً: إضافة UserModule هنا ليتمكن AuthService من استخدام UserService
    PassportModule,
  // ✅ نضيف مستودع Tenant هنا حتى نسمح لـ AuthController بالبحث بالـ tenantCode
  TypeOrmModule.forFeature([Tenant, User, AuthToken]),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '1d' },
    }),
    AuditModule,
  ],
  providers: [AuthService, JwtStrategy, AuthTokenService, RateLimiterRegistry, RateLimitGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
