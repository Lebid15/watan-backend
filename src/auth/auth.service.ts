// src/auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { User } from '../user/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateByEmailOrUsername(
    emailOrUsername: string,
    password: string,
    tenantId: string | null,
  ): Promise<(Omit<User, 'password'> & { priceGroup?: any }) | null> {
    console.log('[AUTH] validate emailOrUsername=', emailOrUsername, 'tenantId=', tenantId);

    let user: any = null;

    if (tenantId) {
      user =
        (await this.userService.findByEmail(emailOrUsername, tenantId, ['priceGroup'])) ||
        (await this.userService.findByUsername(emailOrUsername, tenantId, ['priceGroup']));
      console.log('[AUTH] lookup in tenant -> found?', !!user);
    }

    if (!user) {
      user = await this.userService.findOwnerByEmailOrUsername(emailOrUsername, ['priceGroup']);
      console.log('[AUTH] lookup as OWNER (tenantId IS NULL) -> found?', !!user);
    }

    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('[AUTH] password match?', isMatch, 'role=', user.role, 'tenantId=', user.tenantId ?? null);
    if (!isMatch) return null;

    const { password: _omitted, ...result } = user;
    return result as any;
  }

  async login(user: any, tenantIdFromContext: string | null) {
    const effectiveTenantId: string | null = user.tenantId ?? tenantIdFromContext ?? null;

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role ?? 'user',
      tenantId: effectiveTenantId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role ?? 'user',
        balance: user.balance ?? 0,
        fullName: user.fullName ?? null,
        phoneNumber: user.phoneNumber ?? null,
        priceGroupId: user.priceGroup?.id || null,
        priceGroupName: user.priceGroup?.name || null,
        tenantId: effectiveTenantId,
      },
    };
  }

  async register(dto: CreateUserDto, tenantId: string) {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for registration');
    }

    const existing = await this.userService.findByEmail(dto.email, tenantId);
    if (existing) {
      throw new ConflictException('البريد الإلكتروني مستخدم مسبقًا');
    }
  // ملاحظة: UserService.createUser يقوم بعمل التجزئة مرة واحدة.
  // كان هنا تجزئة مكررة (double hash) تسبب فشل تسجيل الدخول. تمت إزالتها.
  const newUser = await this.userService.createUser(dto, tenantId);
    const { password, ...result } = newUser;
    return result;
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    tenantId: string,
  ): Promise<void> {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for password change');
    }
    const user = await this.userService.findByIdWithPassword(userId, tenantId);
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) throw new UnauthorizedException('كلمة السر الحالية غير صحيحة');

    await this.userService.setPassword(userId, newPassword, tenantId);
  }
}
