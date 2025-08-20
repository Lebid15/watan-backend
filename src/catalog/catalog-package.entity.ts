import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CatalogProduct } from './catalog-product.entity';

@Entity('catalog_package')
@Index(['sourceProviderId', 'externalPackageId'], { unique: false })
export class CatalogPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CatalogProduct, (p) => p.packages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalogProductId' })
  catalogProduct: CatalogProduct;

  @Column({ type: 'uuid' })
  @Index()
  catalogProductId: string;

  @Column({ length: 200 })
  name: string;

  // كود عام للربط الخارجي داخل المنصة
  @Column({ type: 'varchar', length: 120, unique: true })
  publicCode: string;

  // لو خارجي
  @Column({ type: 'uuid', nullable: true })
  sourceProviderId?: string | null;

  // معرف الحزمة عند المزود
  @Column({ type: 'varchar', length: 120, nullable: true })
  externalPackageId?: string | null;

  // تكلفة المزود (اختياري كبداية)
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  costPrice?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currencyCode?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
