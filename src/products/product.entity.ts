import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { ProductPackage } from './product-package.entity';

@Entity('product')
@Index(['tenantId', 'name'], { unique: true }) // اسم المنتج فريد داخل نفس الـ tenant
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  imageUrl?: string; // رابط الصورة من Cloudinary

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ProductPackage, (pkg) => pkg.product, { cascade: true })
  packages: ProductPackage[];
}
