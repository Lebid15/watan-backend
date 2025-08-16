import { Body, Controller, Get, Param, Patch, UseGuards, Query } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';
import { ListDepositsDto } from './dto/list-deposits.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/deposits')
export class DepositsAdminController {
  constructor(private readonly depositsService: DepositsService) {}

  /** GET /admin/deposits?limit=&cursor=&q=&status=&methodId=&from=&to= */
  @Get()
  list(@Query() query: ListDepositsDto) {
    return this.depositsService.listWithPagination(query);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateDepositStatusDto) {
    return this.depositsService.setStatus(id, dto.status);
  }
}
