import { Body, Controller, Get, Param, Patch, UseGuards, Query, Req } from '@nestjs/common';
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
  list(@Req() req: any, @Query() query: ListDepositsDto) {
    const tenantId = req.user?.tenantId as string;
    return this.depositsService.listWithPagination(query, tenantId);
  }

  @Patch(':id/status')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDepositStatusDto) {
    const tenantId = req.user?.tenantId as string;
    return this.depositsService.setStatus(id, tenantId, dto.status);
  }
}
