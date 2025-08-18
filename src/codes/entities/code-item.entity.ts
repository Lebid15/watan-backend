import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index
} from 'typeorm';
import { CodeGroup } from './code-group.entity';

export type CodeStatus = 'available' | 'reserved' | 'used' | 'disabled';

@Entity('code_item')
export class CodeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CodeGroup, (g) => g.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: CodeGroup;

  @Index()
  @Column({ type: 'uuid' })
  groupId: string;

  // ندعم PIN/SERIAL أو واحد منهما
  @Column({ type: 'varchar', length: 256, nullable: true })
  pin?: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  serial?: string;

  // تكلفة شراء هذا الكرت (اختياري)
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  cost: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'available' })
  status: CodeStatus;

  // لربط الكرت بطلب عند الاستهلاك
  @Index()
  @Column({ type: 'uuid', nullable: true })
  orderId?: string;

  @Column({ type: 'timestamp', nullable: true })
  reservedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
