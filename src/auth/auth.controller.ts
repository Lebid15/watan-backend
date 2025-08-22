// src/auth/auth.controller.ts
import { Controller, Post, Body, BadRequestException, UnauthorizedException, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { ApiTags, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Request } from 'express';

class LoginDto {
  emailOrUsername?: string;
  email?: string;
  username?: string;
  password: string;
  tenantCode?: string; // اختياري: لتحديد المتجر عند غياب الدومين
}

class ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectRepository(Tenant) private readonly tenantsRepo: Repository<Tenant>,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'تسجيل الدخول بالبريد أو اسم المستخدم' })
  @ApiResponse({ status: 201, description: 'تم تسجيل الدخول بنجاح' })
  @ApiResponse({ status: 401, description: 'بيانات غير صحيحة' })
  @ApiBody({ type: LoginDto })
  async login(@Req() req: Request, @Body() body: LoginDto) {
    const emailOrUsername = body.emailOrUsername ?? body.email ?? body.username;
    if (!emailOrUsername || !body.password) {
      throw new BadRequestException('يرجى إرسال emailOrUsername أو email أو username مع password');
    }

    let tenantIdFromContext: string | null = (req as any)?.tenant?.id ?? null;
    if (!tenantIdFromContext && body.tenantCode) {
      const tenant = await this.tenantsRepo.findOne({ where: { code: body.tenantCode } });
      if (tenant && tenant.isActive) tenantIdFromContext = tenant.id;
    }
    console.log('[CTRL] /auth/login tenantFromCtx=', tenantIdFromContext, 'emailOrUsername=', emailOrUsername, 'tenantCode=', body.tenantCode);

    const user = await this.authService.validateByEmailOrUsername(
      emailOrUsername,
      body.password,
      tenantIdFromContext,
    );
    if (!user) throw new UnauthorizedException('بيانات تسجيل الدخول غير صحيحة');

    const { access_token } = await this.authService.login(user, tenantIdFromContext);
    return { token: access_token };
  }

  @Post('register')
  @ApiOperation({ summary: 'إنشاء حساب جديد' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الحساب بنجاح' })
  async register(@Req() req: Request, @Body() body: CreateUserDto) {
    const tenantId = (req as any)?.tenant?.id;
    if (!tenantId) throw new BadRequestException('Tenant ID مفقود');
    return this.authService.register(body, tenantId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    if (!body?.oldPassword || !body?.newPassword) {
      throw new BadRequestException('oldPassword و newPassword مطلوبة');
    }

    const tenantId = req?.tenant?.id || req?.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant ID مفقود');

    await this.authService.changePassword(
      req.user.id ?? req.user.sub,
      body.oldPassword,
      body.newPassword,
      tenantId,
    );

    return { ok: true };
  }
}
