import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('deposits')
export class DepositsController {
  constructor(private readonly service: DepositsService) {}

  @Get('mine')
  myDeposits(@Req() req: any) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    return this.service.findMy(userId);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateDepositDto) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    return this.service.createDeposit(userId, dto);
  }
}
