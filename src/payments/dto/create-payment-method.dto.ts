import { PaymentMethodType } from '../payment-method.entity';

export class CreatePaymentMethodDto {
  name: string;
  type: PaymentMethodType;
  logoUrl?: string;
  note?: string;
  isActive?: boolean;
  /** حقول ديناميكية حسب النوع */
  config?: Record<string, any>;
}
