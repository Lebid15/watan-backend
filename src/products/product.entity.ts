import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { ProductPackage } from '../products/product-package.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  image: string;

  @CreateDateColumn()
  createdAt: Date;

  // 🔹 العلاقة مع الباقات
  @OneToMany(() => ProductPackage, (pkg) => pkg.product, { cascade: true })
  packages: ProductPackage[];
}
