import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('auth_tokens')
@Index('idx_auth_token_user', ['userId'])
@Index('idx_auth_token_type', ['type'])
export class AuthToken {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid', nullable: true }) tenantId: string | null;

  @Column({ type: 'varchar', length: 20 }) type: 'email_verify' | 'password_reset';

  // sha256 hex
  @Column({ type: 'varchar', length: 64 }) tokenHash: string;

  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) usedAt?: Date | null;

  @CreateDateColumn() createdAt: Date;
}
