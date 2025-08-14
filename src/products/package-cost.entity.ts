import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProductPackage } from '../products/product-package.entity';

/** تكلفة الباقة لكل مزوّد (لاحتساب الربح بدقة عند الإرسال الخارجي) */
@Entity('package_costs')
@Unique('ux_package_costs_pkg_provider', ['package', 'providerId'])
export class PackageCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductPackage, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'package_id' })
  package: ProductPackage;

  /** Integration.id */
  @Column({ type: 'varchar' })
  providerId: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  costCurrency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costAmount: number;
}
