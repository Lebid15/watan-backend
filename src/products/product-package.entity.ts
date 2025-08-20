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
export class ProductPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // كود ربط عام (اختياري)
  @Index('ux_product_packages_public_code', { unique: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  publicCode: string | null;

  // اسم الباقة
  @Column({ length: 160 })
  name: string;

  // وصف الباقة (اختياري)
  @Column({ type: 'text', nullable: true })
  description?: string;

  // صورة الباقة (اختياري)
  @Column({ nullable: true })
  imageUrl?: string;

  // السعر الأساسي (USD)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  basePrice: number;

  // رأس المال (USD)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  capital: number;

  // حالة التفعيل
  @Column({ default: true })
  isActive: boolean;

  // العلاقة مع المنتج الأساسي — صراحةً إلى جدول "products" والعمود "id"
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

  // العلاقة مع أسعار المجموعات
  @OneToMany(() => PackagePrice, (pp) => pp.package, { cascade: true, eager: true })
  prices: PackagePrice[];
}
