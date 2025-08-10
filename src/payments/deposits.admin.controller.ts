import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/deposits')
export class DepositsAdminController {
  constructor(private readonly service: DepositsService) {}

  @Get()
  list() {
    return this.service.findAllAdmin();
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateDepositStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
}
