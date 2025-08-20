import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ProviderKind = 'barakat' | 'apstore' | 'znet';
export type IntegrationScope = 'dev' | 'tenant';

@Entity('integrations')
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 120 })
  name!: string;

  @Index('idx_integrations_provider')
  @Column({ type: 'varchar', length: 20 })
  provider!: ProviderKind;

  // dev = مزود المطوّر (مصدر الكتالوج)
  // tenant = مزود المشرف (لتنفيذ الطلبات)
  @Index('idx_integrations_scope')
  @Column({ type: 'varchar', length: 10, default: 'tenant' })
  scope!: IntegrationScope;

  @Column({ type: 'varchar', length: 255, nullable: true })
  baseUrl?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  apiToken?: string | null;

  // لزِنت
  @Column({ type: 'varchar', length: 120, nullable: true })
  kod?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sifre?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
