import {
  Controller,
  Post,
  Body,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginDto {
  emailOrUsername?: string;
  email?: string;
  username?: string;
  password: string;
}

// 👇 ضع DTO هنا خارج الكلاس
class ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'تسجيل الدخول بالبريد أو اسم المستخدم' })
  @ApiResponse({ status: 201, description: 'تم تسجيل الدخول بنجاح' })
  @ApiResponse({ status: 401, description: 'بيانات غير صحيحة' })
  @ApiBody({ type: LoginDto })
  async login(@Body() body: LoginDto) {
    const emailOrUsername = body.emailOrUsername ?? body.email ?? body.username;
    if (!emailOrUsername || !body.password) {
      throw new BadRequestException(
        'يرجى إرسال emailOrUsername أو email أو username مع password',
      );
    }

    const user = await this.authService.validateByEmailOrUsername(
      emailOrUsername,
      body.password,
    );
    if (!user) throw new UnauthorizedException('بيانات تسجيل الدخول غير صحيحة');

    const { access_token } = await this.authService.login(user);
    return { token: access_token };
  }

  @Post('register')
  @ApiOperation({ summary: 'إنشاء حساب جديد' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الحساب بنجاح' })
  async register(@Body() body: CreateUserDto) {
    return this.authService.register(body);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req, @Body() body: ChangePasswordDto) {
    if (!body?.oldPassword || !body?.newPassword) {
      throw new BadRequestException('oldPassword و newPassword مطلوبة');
    }
    await this.authService.changePassword(
      req.user.id ?? req.user.sub,
      body.oldPassword,
      body.newPassword,
    );
    
    return { ok: true };
  }
}
