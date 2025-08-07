// src/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../user/dto/create-user.dto';

class LoginDto {
  email: string;
  password: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'تسجيل الدخول' })
  @ApiResponse({ status: 201, description: 'تم تسجيل الدخول بنجاح' })
  @ApiResponse({ status: 401, description: 'بيانات غير صحيحة' })
  @ApiBody({ type: LoginDto })
  async login(@Body() body: LoginDto) {
    const user = await this.authService.validateUser(body.email, body.password);

    if (!user) {
      throw new UnauthorizedException('بيانات تسجيل الدخول غير صحيحة');
    }

    const { access_token } = await this.authService.login(user);

    // ✅ نعيد فقط التوكن، وجلب بيانات المستخدم سيكون من /users/profile
    return { token: access_token };
  }

  @Post('register')
  @ApiOperation({ summary: 'إنشاء حساب جديد' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الحساب بنجاح' })
  async register(@Body() body: CreateUserDto) {
    return this.authService.register(body);
  }
}
