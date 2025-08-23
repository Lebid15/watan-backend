import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/user.entity';

@Entity('passkey_credentials')
@Index('idx_passkey_user', ['userId'])
@Index('idx_passkey_tenant_user', ['tenantId', 'userId'])
export class PasskeyCredential {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', nullable: true }) tenantId: string | null;

  @Column({ type: 'varchar', length: 200, unique: true }) credentialId: string; // base64url

  @Column({ type: 'bytea' }) publicKey: Buffer;

  @Column({ type: 'bigint', default: 0 }) counter: number;

  @Column({ type: 'text', array: true, nullable: true }) transports?: string[] | null;

  @Column({ type: 'varchar', length: 30, nullable: true }) deviceType?: string | null; // singleDevice | multiDevice

  @Column({ type: 'boolean', nullable: true }) backedUp?: boolean | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true }) lastUsedAt?: Date | null;
}