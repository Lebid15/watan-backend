// src/user/user.entity.ts
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

  // 🔹 العلاقة مع المشرف
  @Column({ type: 'uuid', nullable: true })
  adminId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'adminId' })
  admin?: User | null;

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

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  overdraftLimit: number;

  @Column({ type: 'uuid', nullable: true })
  price_group_id?: string | null;

  @ManyToOne(() => PriceGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'price_group_id' })
  priceGroup?: PriceGroup | null;

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
