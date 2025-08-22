import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { ProductPackage } from './product-package.entity';
import { PriceGroup } from './price-group.entity';

@Entity('package_prices')
@Unique(['tenantId', 'package', 'priceGroup']) // ✅ يمنع التكرار داخل نفس الـ tenant
export class PackagePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔑 ربط بالـ Tenant
  @Column('uuid')
  @Index()
  tenantId: string;

  // ملاحظة: إن أردت قراءة الرقم كـ number دائمًا، يمكن لاحقًا إضافة transformer
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  price: number;

  @Index('idx_package_prices_package_id')
  @ManyToOne(() => ProductPackage, (pkg) => pkg.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: ProductPackage;

  @Index('idx_package_prices_group_id')
  @ManyToOne(() => PriceGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'price_group_id' })
  priceGroup: PriceGroup;
}
