import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ProductPackage } from './product-package.entity';
import { PriceGroup } from './price-group.entity';

@Entity('package_prices')
export class PackagePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  price: number;

  @ManyToOne(() => ProductPackage, (pkg) => pkg.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: ProductPackage;

  @ManyToOne(() => PriceGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'price_group_id' })
  priceGroup: PriceGroup;
}
