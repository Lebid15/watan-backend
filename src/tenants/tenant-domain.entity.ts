import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn
} from 'typeorm';
import { Tenant } from './tenant.entity';

export type DomainType = 'subdomain' | 'custom';

@Entity('tenant_domain')
@Index(['domain'], { unique: true })
export class TenantDomain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, (t) => t.domains, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column('uuid')
  tenantId: string;

  // مثل: store1.example.com أو example.shop
  @Column({ length: 190 })
  domain: string;

  @Column({ type: 'varchar', length: 20, default: 'subdomain' })
  type: DomainType;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ default: false })
  isVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
