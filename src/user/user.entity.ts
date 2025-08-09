import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PriceGroup } from '../products/price-group.entity';
import { Currency } from '../currencies/currency.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ default: 'user' })
  role: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  countryCode: string;

  @Column({ nullable: true })
  nationalId: string;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  fullName: string;

  // ✅ حالة التفعيل/التعطيل
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // ✅ حد السالب (يسمح بالسالب حتى هذا الحد، 0 = لا يسمح)
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  overdraftLimit: number;

  // ✅ FK لمجموعة الأسعار
  @Column({ type: 'uuid', nullable: true })
  price_group_id?: string | null;

  @ManyToOne(() => PriceGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'price_group_id' })
  priceGroup?: PriceGroup | null;

  // ✅ FK للعملة
  @Column({ type: 'uuid', nullable: true })
  currency_id?: string | null;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currency_id' })
  currency?: Currency | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
