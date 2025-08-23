import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// Minimal audit log entity
@Entity('audit_logs')
@Index('idx_audit_event', ['eventType'])
@Index('idx_audit_actor', ['actorUserId'])
@Index('idx_audit_tenant', ['targetTenantId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 60 }) eventType: string; // e.g. login_success, assume_tenant

  @Column({ type: 'uuid', nullable: true }) actorUserId?: string | null;
  @Column({ type: 'uuid', nullable: true }) targetUserId?: string | null;
  @Column({ type: 'uuid', nullable: true }) targetTenantId?: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true }) ip?: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) userAgent?: string | null;

  @Column({ type: 'jsonb', nullable: true }) meta?: Record<string, any> | null;

  @CreateDateColumn() createdAt: Date;
}
