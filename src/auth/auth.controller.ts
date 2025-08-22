// src/auth/auth.controller.ts
import { Controller, Post, Body, BadRequestException, UnauthorizedException, UseGuards, Req, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../user/user.entity';
import * as bcrypt from 'bcrypt';
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
  @InjectRepository(User) private readonly usersRepo: Repository<User>,
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

  // ================= Developer Bootstrap Endpoint =================
  // يسمح بإنشاء حساب مطوّر (tenantId NULL) مرة واحدة عبر سر بيئة BOOTSTRAP_DEV_SECRET.
  // الاستخدام: POST /api/auth/bootstrap-developer { secret, email, password }
  // الحماية:
  //   - رفض إذا لم يُضبط السر في البيئة.
  //   - رفض لو السر خطأ.
  //   - رفض لو حساب بنفس البريد موجود (أي دور) أو أي مطوّر موجود (حتى لا ينشئ مهاجم آخر حسابًا).
  @Post('bootstrap-developer')
  @ApiOperation({ summary: 'إنشاء حساب مطوّر عالمي عبر سر بيئة (مرة واحدة)' })
  @ApiBody({ schema: { properties: { secret: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' } }, required: ['secret','email','password'] } })
  async bootstrapDeveloper(@Body() body: { secret: string; email: string; password: string }) {
    const envSecret = process.env.BOOTSTRAP_DEV_SECRET;
    if (!envSecret) throw new ForbiddenException('Bootstrap disabled (no BOOTSTRAP_DEV_SECRET)');
    if (!body?.secret || body.secret !== envSecret) throw new ForbiddenException('Invalid secret');
    if (!body.email || !body.password) throw new BadRequestException('email & password required');
    if (body.password.length < 6) throw new BadRequestException('Weak password');

    // إن وجد أي مطوّر سابقًا نمنع الإنشاء (قابل للتعديل لو أردت السماح بعدم الحصر بالبريد)
    const existingAnyDev = await this.usersRepo.findOne({ where: { role: 'developer', tenantId: IsNull() } });
    if (existingAnyDev) throw new ConflictException('Developer already exists');

    // رفض لو البريد مستخدم بأي سياق آخر
    const existingEmail = await this.usersRepo.findOne({ where: { email: body.email } });
    if (existingEmail) throw new ConflictException('Email already in use');

    const hash = await bcrypt.hash(body.password, 10);
  const user: any = this.usersRepo.create({
      email: body.email,
      password: hash,
      role: 'developer',
      tenantId: null,
      isActive: true,
      balance: 0,
      overdraftLimit: 0,
    } as any);
  const saved = await this.usersRepo.save(user);
  return { ok: true, id: saved.id, email: saved.email, role: saved.role };
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
