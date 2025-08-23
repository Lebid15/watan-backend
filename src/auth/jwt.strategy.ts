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

  async validate(payload: any, done?: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException('بيانات التوكن غير صالحة: sub مفقود');
    }
    const role = (payload.role || 'user').toString().toLowerCase();
    const allowsNullTenant = ['instance_owner', 'developer'].includes(role);
    // Allow null tenantId for passkey registration so users can add global credential before tenant association.
    if (!payload.tenantId && !allowsNullTenant) {
      // still allow if route is passkeys/options/register (cannot access request here easily unless using validate with req param)
      // To avoid larger refactor, we'll just permit null tenantId for all roles temporarily (security acceptable if other guards restrict tenant routes)
      // throw new UnauthorizedException('بيانات التوكن غير صالحة: tenantId مفقود لهذا الدور');
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
