// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConstants } from './constants';
import { UserService } from '../user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // ✅ أخذ التوكن من Authorization: Bearer
      ignoreExpiration: false, // ✅ لا تتجاهل انتهاء الصلاحية
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {

    // payload يجب أن يحتوي على sub = user.id
    const userId = payload.sub;
    if (!userId) {
      console.error('❌ JWT payload لا يحتوي على sub (معرف المستخدم)');
      throw new UnauthorizedException();
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      console.error('❌ المستخدم غير موجود في قاعدة البيانات');
      throw new UnauthorizedException();
    }

    return user; // سيتم وضعه في req.user تلقائيًا
  }
}
