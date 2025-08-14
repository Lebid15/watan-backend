import { 
  Controller, 
  Get, 
  Delete, 
  UseGuards, 
  Request, 
  Param 
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserService } from '../user/user.service';
import { UserRole } from '../auth/user-role.enum';
import { IntegrationsService } from '../integrations/integrations.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly userService: UserService,
    private readonly integrationsService: IntegrationsService, // ✅ أضفناه هنا
  ) {}

  @Roles(UserRole.ADMIN)
  @Get('dashboard')
  getAdminDashboard(@Request() req) {
    return { message: 'Welcome Admin', user: req.user };
  }

  @Roles(UserRole.ADMIN)
  @Get('users')
  async getAllUsers() {
    const users = await this.userService.findAllUsers();
    // حذف كلمة السر من النتائج
    return users.map(({ password, ...user }) => user);
  }

}
