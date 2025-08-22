import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';
import { PaymentMethod } from './payment-method.entity';

export enum DepositStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity({ name: 'deposit' })
@Index(['tenantId', 'status', 'createdAt'])
@Index(['tenantId', 'user_id'])
export class Deposit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  tenantId: string;

  /** المستخدم صاحب الطلب */
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  user_id: string;

  /** وسيلة الدفع المختارة */
  @ManyToOne(() => PaymentMethod, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'method_id' })
  method: PaymentMethod;

  @Column({ type: 'uuid' })
  method_id: string;

  /** مبلغ الإيداع الأصلي والعملة التي أرسل بها */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  originalAmount: string;

  /** مثال: USD, TRY, EUR ... */
  @Column({ type: 'varchar', length: 10 })
  originalCurrency: string;

  /** عملة محفظة المستخدم (مثلاً TRY) */
  @Column({ type: 'varchar', length: 10 })
  walletCurrency: string;

  /** سعر الصرف المستخدم للتحويل */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  rateUsed: string;

  /** الناتج بعد التحويل إلى عملة المحفظة */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  convertedAmount: string;

  /** ملاحظة من المستخدم (اختياري) */
  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** حالة الطلب */
  @Column({ type: 'enum', enum: DepositStatus, default: DepositStatus.PENDING })
  status: DepositStatus;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
