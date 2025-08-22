import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './user-role.enum';  // تأكد من المسار الصحيح

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // لا قيود
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      return false; // إذا كان المستخدم أو الدور مفقودين
    }

    // السماح للمطوّر ومالك النسخة بعدم وجود tenantId
    const globalRoles = [UserRole.DEVELOPER, UserRole.INSTANCE_OWNER];
    if (!user.tenantId && !globalRoles.includes(user.role)) {
      return false; // المستخدمون العاديون يحتاجون tenantId
    }

    return requiredRoles.includes(user.role);
  }
}
