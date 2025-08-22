import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConstants } from './constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException('بيانات التوكن غير صالحة: sub مفقود');
    }
    const role = (payload.role || 'user').toString().toLowerCase();
    const allowsNullTenant = ['instance_owner', 'developer'].includes(role);
    if (!payload.tenantId && !allowsNullTenant) {
      throw new UnauthorizedException('بيانات التوكن غير صالحة: tenantId مفقود لهذا الدور');
    }
    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      role,
      tenantId: payload.tenantId ?? null,
    };
  }
}
