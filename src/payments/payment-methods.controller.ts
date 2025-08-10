import { Controller, Get } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  /** المستخدم: إرجاع الوسائل المفعّلة فقط */
  @Get('active')
  findActive() {
    return this.service.findActive();
  }
}
