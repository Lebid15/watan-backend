import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductPackage } from '../products/product-package.entity';

export type RoutingMode = 'manual' | 'auto';
export type ProviderType = 'manual' | 'external' | 'internal_codes';

@Entity('package_routing')
@Unique('ux_package_routing_package_tenant', ['tenantId', 'package'])
export class PackageRouting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔑 ربط بالـ Tenant
  @Column('uuid')
  @Index()
  tenantId: string;

  @ManyToOne(() => ProductPackage, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'package_id' })
  package: ProductPackage;

  @Column({ type: 'varchar', length: 10, default: 'manual' })
  mode: RoutingMode; // manual | auto

  /** نوع التوجيه: يدوي، خارجي (مزود)، داخلي (قسم الأكواد) */
  @Column({ type: 'varchar', length: 32, default: 'manual' })
  providerType: ProviderType;

  /** Integration.id للمزوّد الأساسي */
  @Column({ type: 'varchar', nullable: true })
  primaryProviderId?: string | null;

  /** Integration.id للمزوّد الاحتياطي */
  @Column({ type: 'varchar', nullable: true })
  fallbackProviderId?: string | null;

  /** عند التوجيه إلى قسم الأكواد: مجموعة الأكواد المستخدمة */
  @Column({ type: 'uuid', nullable: true })
  codeGroupId?: string | null;
}
