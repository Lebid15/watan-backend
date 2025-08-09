import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('currencies')
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // مثال: USD, TRY, SYP

  @Column()
  name: string; // مثال: الدولار الأمريكي

  @Column('decimal', { precision: 10, scale: 4, default: 1 })
  rate: number; // كم يساوي من الدولار الأساسي

  @Column({ default: true })
  isActive: boolean; // لتفعيل/تعطيل العملة

  @Column({ default: false })
  isPrimary: boolean; // هل هي العملة الأساسية

  @Column({ nullable: true })
  symbolAr: string; // الرمز العربي — مثال: "ل.س", "د.إ"
}
