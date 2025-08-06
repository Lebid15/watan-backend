import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  ManyToOne, 
  OneToMany, 
  JoinColumn 
} from 'typeorm';
import { Product } from './product.entity';
import { PackagePrice } from './package-price.entity';

@Entity('product_packages')
export class ProductPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔹 اسم الباقة
  @Column({ length: 100 })
  name: string;

  @Column({ nullable: true })
  imageUrl: string;

  // 🔹 وصف الباقة (اختياري)
  @Column({ type: 'text', nullable: true })
  description?: string;

  // 🔹 السعر الأساسي للباقة
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  basePrice: number;

  // 🔹 رأس المال
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  capital: number;

  // 🔹 حالة التفعيل
  @Column({ default: true })
  isActive: boolean;

  // 🔹 العلاقة مع المنتج الأساسي
  @ManyToOne(() => Product, (product) => product.packages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  // 🔹 العلاقة مع أسعار المجموعات
  @OneToMany(() => PackagePrice, (price) => price.package, { cascade: true, eager: true })
  prices: PackagePrice[];
}
