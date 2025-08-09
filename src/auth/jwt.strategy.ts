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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload: missing sub');
    }

    const user = await this.userService.findById(payload.sub, ['currency']);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // نرجع بيانات محددة فقط
    return {
      id: user.id, // UUID صحيح من قاعدة البيانات
      email: user.email,
      role: user.role,
      currencyId: user.currency?.id || null,
    };
  }
}
