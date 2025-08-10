import { DepositStatus } from '../deposit.entity';

export class UpdateDepositStatusDto {
  status: DepositStatus; // pending | approved | rejected
}
