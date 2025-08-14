import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Generated,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { User } from '../user/user.entity';

export type InternalOrderStatus = 'pending' | 'approved' | 'rejected';
export type ExternalOrderStatus =
  | 'not_sent'
  | 'queued'
  | 'sent'
  | 'processing'
  | 'done'
  | 'failed';

@Entity('product_orders')
export class ProductOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** رقم طلب متسلسل (غير أساسي) */
  @Index('idx_orders_order_no', { unique: true })
  @Column({ type: 'int', nullable: true })
  @Generated('increment')
  orderNo: number | null;

  @ManyToOne(() => Product, { eager: true })
  product: Product;

  @ManyToOne(() => ProductPackage, { eager: true })
  package: ProductPackage;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** سعر البيع النهائي للمستخدم (لإظهار الربح) */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  sellPriceCurrency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  sellPriceAmount: number;

  /** الحفاظ على "price" القديم للتوافق إن كان مُستخدمًا في الواجهة */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  /** رأس المال/سعر التكلفة (Manual أو من المزوّد) */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  costCurrency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costAmount: number;

  /** الربح = بيع - تكلفة (يمكن حسابه بالـ service) */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  profitAmount: number;

  /** الحالة الداخلية */
  @Column({ type: 'varchar', default: 'pending' })
  status: InternalOrderStatus;

  @ManyToOne(() => User, { eager: true })
  user: User;

  /** معرّف اللاعب/الحساب الذي يُدخِله المستخدم */
  @Column({ type: 'varchar', nullable: true })
  userIdentifier?: string | null;

  /** ربط خارجي */
  @Column({ type: 'varchar', nullable: true })
  providerId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  externalOrderId?: string | null;

  @Column({ type: 'varchar', default: 'not_sent' })
  externalStatus: ExternalOrderStatus;

  /** تتبّع محاولات الإرسال والمتابعة */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 250, nullable: true })
  lastMessage?: string | null;

  /** ملاحظات المشرف */
  @Column({ type: 'text', nullable: true })
  manualNote?: string | null;

  /** أزمنة التنفيذ */
  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  /** مدة التنفيذ بالمللي ثانية */
  @Column({ type: 'int', nullable: true })
  durationMs?: number | null;

  /** ✅ التجميد عند الاعتماد */
  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true })
  fxUsdTryAtApproval?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  sellTryAtApproval?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  costTryAtApproval?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  profitTryAtApproval?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  profitUsdAtApproval?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'date', nullable: true })
  approvedLocalDate?: string | null; // YYYY-MM-DD

  @Column({ type: 'char', length: 7, nullable: true })
  approvedLocalMonth?: string | null; // YYYY-MM

  @Column({ type: 'timestamptz', nullable: true })
  fxCapturedAt?: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fxSource?: string | null;

  @Column({ type: 'boolean', default: false })
  fxLocked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
