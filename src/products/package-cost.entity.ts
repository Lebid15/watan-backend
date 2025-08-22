import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { ProductPackage } from '../products/product-package.entity';

/** تكلفة الباقة لكل مزوّد (لاحتساب الربح بدقة عند الإرسال الخارجي) */
@Entity('package_costs')
@Unique('ux_package_costs_pkg_provider_tenant', ['tenantId', 'package', 'providerId']) // فريد لكل tenant + نفس الباقة + نفس المزود
@Index('idx_package_costs_tenant_provider', ['tenantId', 'providerId'])
@Index('idx_package_costs_tenant_pkg', ['tenantId', 'package']) // يساعد في استعلامات الباقة داخل التينانت
export class PackageCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔑 ربط بالـ Tenant
  @Column('uuid')
  @Index()
  tenantId: string;

  @ManyToOne(() => ProductPackage, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'package_id' })
  package: ProductPackage;

  /** Integration.id (حاليًا عندك مخزّن كسلسلة نصية في الجدول) */
  @Column({ type: 'varchar' })
  providerId: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  costCurrency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costAmount: number;
}
