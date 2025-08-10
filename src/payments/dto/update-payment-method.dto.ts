import { PaymentMethodType } from '../payment-method.entity';

export class UpdatePaymentMethodDto {
  name?: string;
  type?: PaymentMethodType;
  logoUrl?: string | null;
  note?: string | null;
  isActive?: boolean;
  config?: Record<string, any>;
}
