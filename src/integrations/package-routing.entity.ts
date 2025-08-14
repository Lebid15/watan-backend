import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProductPackage } from '../products/product-package.entity';

export type RoutingMode = 'manual' | 'auto';

@Entity('package_routing')
@Unique('ux_package_routing_package', ['package'])
export class PackageRouting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductPackage, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'package_id' })
  package: ProductPackage;

  @Column({ type: 'varchar', length: 10, default: 'manual' })
  mode: RoutingMode; // manual | auto

  /** Integration.id للمزوّد الأساسي */
  @Column({ type: 'varchar', nullable: true })
  primaryProviderId?: string | null;

  /** Integration.id للمزوّد الاحتياطي */
  @Column({ type: 'varchar', nullable: true })
  fallbackProviderId?: string | null;
}
