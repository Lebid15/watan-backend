import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { User } from '../user/user.entity';

@Entity('product_orders')
export class ProductOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { eager: true })
  product: Product;

  @ManyToOne(() => ProductPackage, { eager: true })
  package: ProductPackage;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';

  @ManyToOne(() => User, { eager: true })
  user: User;

  @Column({ type: 'varchar', nullable: true })
  userIdentifier?: string | null; // ✅ اختياري ويقبل null

  @CreateDateColumn()
  createdAt: Date;
}
