import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('site_settings')
@Unique(['key'])
export class SiteSetting {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 64 }) key: string;        // 'about' | 'infoes'
  @Column({ type: 'text', nullable: true }) value: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
