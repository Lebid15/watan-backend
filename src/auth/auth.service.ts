// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
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

  /**
   * التحقق من صحة بيانات تسجيل الدخول
   */
  async validateUser(
    email: string,
    password: string,
  ): Promise<(Omit<User, 'password'> & { priceGroup?: any }) | null> {
    // ✅ تحميل المستخدم مع علاقته بمجموعات الأسعار
    const user = await this.userService.findByEmail(email, ['priceGroup']);
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    // استبعاد كلمة المرور
    const { password: _, ...result } = user;
    return result;
  }

  /**
   * تسجيل الدخول وإرجاع JWT مع بيانات المستخدم
   */
  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role ?? 'user',
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
        priceGroupId: user.priceGroup?.id || null,       // ✅
        priceGroupName: user.priceGroup?.name || null,   // ✅
      },
    };
  }

  /**
   * تسجيل مستخدم جديد مع تشفير كلمة المرور
   */
  async register(dto: CreateUserDto) {
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('البريد الإلكتروني مستخدم مسبقًا');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = await this.userService.createUser({
      ...dto,
      password: hashedPassword,
    });

    const { password, ...result } = newUser;
    return result;
  }
}
