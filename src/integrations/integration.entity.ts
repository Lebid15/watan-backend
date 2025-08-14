import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type ProviderKind = 'barakat' | 'apstore' | 'znet';

@Entity('integrations')
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  provider: ProviderKind;

  @Column({ nullable: true })
  baseUrl?: string;

  @Column({ nullable: true })
  apiToken?: string;

  // لزِنت
  @Column({ nullable: true })
  kod?: string;

  @Column({ nullable: true })
  sifre?: string;

  @CreateDateColumn()
  createdAt: Date;
}
