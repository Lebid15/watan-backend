import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/payment-methods')
export class PaymentMethodsAdminController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  findAll(@Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.service.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreatePaymentMethodDto, @Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.service.create(tenantId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto, @Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.service.update(id, tenantId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.service.remove(id, tenantId);
  }
}
