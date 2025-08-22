import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('deposits')
export class DepositsController {
  constructor(private readonly service: DepositsService) {}

  /** ✅ جديد: {items, pageInfo} */
  @Get('mine')
  async myDepositsPaginated(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId   = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    const tenantId = req.user?.tenantId as string;
    const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
    return this.service.listMineWithPagination(userId, tenantId, { limit, cursor: cursor ?? null });
  }

  /** 🔁 alias: يعيد نفس نتيجة /deposits/mine */
  @Get()
  async myDepositsAlias(
    @Req() req: any,
    @Query('limit') limitQ?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId   = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    const tenantId = req.user?.tenantId as string;
    const limit = Math.max(1, Math.min(100, Number(limitQ ?? 20)));
    return this.service.listMineWithPagination(userId, tenantId, { limit, cursor: cursor ?? null });
  }

  /** إنشاء طلب إيداع */
  @Post()
  create(@Req() req: any, @Body() dto: CreateDepositDto) {
    const userId   = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    const tenantId = req.user?.tenantId as string;
    return this.service.createDeposit(userId, tenantId, dto);
  }
}
