// src/notifications/notification.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

export type NotificationType =
  | 'wallet_topup'
  | 'wallet_debit'
  | 'order_status_changed'
  | 'announcement';

@Entity('notifications')
@Index('idx_notifications_user_id', ['user'])
@Index('idx_notifications_is_read', ['isRead'])
@Index('idx_notifications_created_at', ['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 40, default: 'announcement' })
  type: NotificationType;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any> | null;

  @Column({ default: false })
  isRead: boolean;

  // ✅ الحقول الجديدة
  @Column({ type: 'timestamp with time zone', nullable: true })
  readAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  link: string | null;

  @Column({ type: 'varchar', length: 20, default: 'in_app' })
  channel: string; // in_app | email | sms | ...

  @Column({ type: 'varchar', length: 10, default: 'normal' })
  priority: string; // low | normal | high

  @CreateDateColumn()
  createdAt: Date;
}
