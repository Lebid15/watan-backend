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

@Unique(['package', 'priceGroup'])               // ✅ يمنع التكرار لنفس (الباقة، المجموعة)
@Entity('package_prices')
export class PackagePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ملاحظة: إن أردت قراءة الرقم كـ number دائمًا، يمكن لاحقًا إضافة transformer
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  price: number;

  @Index('idx_package_prices_package_id')        // (اختياري) فهارس لتحسين الاستعلامات
  @ManyToOne(() => ProductPackage, (pkg) => pkg.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: ProductPackage;

  @Index('idx_package_prices_group_id')          // (اختياري)
  @ManyToOne(() => PriceGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'price_group_id' })
  priceGroup: PriceGroup;
}
