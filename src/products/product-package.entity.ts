import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { PackagePrice } from './package-price.entity';

@Entity('product_packages')
@Index('ux_product_packages_public_code_tenant', ['tenantId', 'publicCode'], { unique: true })
@Index('idx_product_packages_tenant_active', ['tenantId', 'isActive'])
@Index('idx_product_packages_product_id', ['product']) // يُنشئ فهرسًا على product_id
export class ProductPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  tenantId: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  publicCode: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  basePrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  capital: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Product, (product) => product.packages, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'product_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_product_packages_product_id',
  })
  product: Product;

  @OneToMany(() => PackagePrice, (pp) => pp.package, { cascade: true, eager: true })
  prices: PackagePrice[];
}
