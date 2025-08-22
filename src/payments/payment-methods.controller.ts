import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  findActive(@Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.service.findActive(tenantId);
  }

  // alias: /payment-methods/active (كان الفرونت يستدعي هذا المسار فحصل 404)
  @Get('active')
  findActiveAlias(@Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.service.findActive(tenantId);
  }
}
