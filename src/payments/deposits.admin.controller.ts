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
// ملاحظة: أبقينا نفس المسار القديم كي لا نكسر أي عميل يعتمد عليه
@Controller('admin/deposits')
export class DepositsAdminController {
  constructor(private readonly service: DepositsService) {}

  /**
   * GET /admin/deposits
   * يدعم: limit, cursor, q, status, methodId, from, to
   * ويعيد: { items, pageInfo: { nextCursor, hasMore }, meta }
   */
  @Get()
  list(@Query() query: ListDepositsDto) {
    return this.service.listDepositsWithPagination(query);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateDepositStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
}
