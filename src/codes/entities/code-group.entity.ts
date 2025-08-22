import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { CodeItem } from './code-item.entity';

@Entity('code_group')
@Unique('ux_code_group_public_code_tenant', ['tenantId', 'publicCode'])
export class CodeGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔑 ربط بالـ Tenant
  @Column('uuid')
  @Index()
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  name: string; // مثال: "Google Play 25 TL"

  @Index()
  @Column({ type: 'varchar', length: 32 })
  publicCode: string; // مثال: "GPLAY-25TRY"

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ type: 'varchar', length: 32, default: 'internal_codes' })
  providerType: 'internal_codes';

  @Index()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => CodeItem, (i) => i.group)
  items: CodeItem[];
}
