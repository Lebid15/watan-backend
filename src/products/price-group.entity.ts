import { Entity, PrimaryGeneratedColumn, Column, OneToMany, Index } from 'typeorm';
import { PackagePrice } from './package-price.entity';
import { User } from '../user/user.entity';

@Entity('price_groups')
@Index('ux_price_groups_name_tenant', ['tenantId', 'name'], { unique: true })
export class PriceGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔑 ربط بالـ Tenant
  @Column('uuid')
  @Index()
  tenantId: string;

  @Column()
  name: string; // مثال: "غالي", "رخيص", "VIP"

  @Column({ default: true })
  isActive: boolean;

  // 🔹 العلاقة مع أسعار الباقات
  @OneToMany(() => PackagePrice, (pp) => pp.priceGroup, { cascade: true })
  prices: PackagePrice[];

  // ✅ العلاقة مع المستخدمين لاحتساب usersCount
  @OneToMany(() => User, (user) => user.priceGroup)
  users: User[];
}
