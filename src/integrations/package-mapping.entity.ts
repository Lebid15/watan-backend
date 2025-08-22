import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('package_mappings')
export class PackageMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔑 ربط بالـ Tenant
  @Column('uuid')
  @Index()
  tenantId: string;

  @Column()
  our_package_id: string; // ID الباقة عندنا

  @Column()
  provider_api_id: string; // ID الـ Integration

  @Column()
  provider_package_id: string; // ID الباقة عند المزود

  @Column({ type: 'jsonb', nullable: true })
  meta?: {
    oyun?: string;
    kupur?: string;
  };
}
