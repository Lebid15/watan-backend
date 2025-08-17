import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PackagePrice } from './package-price.entity';
import { User } from '../user/user.entity';

@Entity('price_groups')
export class PriceGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
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
