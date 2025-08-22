import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('site_settings')
@Index(['tenantId', 'key'], { unique: true }) // المفتاح فريد داخل كل مستأجر
export class SiteSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  tenantId: string;

  @Column({ length: 64 })
  key: string; // مثال: 'about' | 'infoes' | ...

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
