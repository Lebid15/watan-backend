import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductOrder } from './product-order.entity';

export type DispatchAction = 'dispatch' | 'refresh';
export type DispatchResult = 'success' | 'fail';

@Entity('order_dispatch_logs')
@Index('idx_dispatch_logs_order', ['order'])
export class OrderDispatchLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔑 ربط بالـ Tenant
  @Column('uuid')
  @Index()
  tenantId: string;

  @ManyToOne(() => ProductOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: ProductOrder;

  @Column({ type: 'varchar', length: 20 })
  action: DispatchAction;

  @Column({ type: 'varchar', length: 10 })
  result: DispatchResult;

  @Column({ type: 'varchar', length: 250, nullable: true })
  message?: string | null;

  /** لقطة من الطلب/الرد (مختصرة وبدون أسرار) */
  @Column({ type: 'jsonb', nullable: true })
  payloadSnapshot?: any;

  @CreateDateColumn()
  createdAt: Date;
}
