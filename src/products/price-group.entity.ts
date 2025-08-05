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

  @OneToMany(() => PackagePrice, (price) => price.priceGroup)
  prices: PackagePrice[];

  // ✅ إضافة العلاقة مع المستخدمين لاحتساب usersCount
  @OneToMany(() => User, (user) => user.priceGroup)
  users: User[];
}
