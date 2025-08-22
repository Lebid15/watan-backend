import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('currencies')
@Index(['tenantId', 'code'], { unique: true }) // كود العملة فريد داخل نفس المستأجر
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index() // لتسريع الفلترة حسب المستأجر
  tenantId: string;

  @Column() // أزلنا unique المنفرد لأن الفريدة أصبحت مركّبة مع tenantId
  code: string; // مثال: USD, TRY, SYP

  @Column()
  name: string; // مثال: الدولار الأمريكي

  @Column('decimal', { precision: 10, scale: 4, default: 1 })
  rate: number; // كم يساوي من الدولار الأساسي

  @Column({ default: true })
  isActive: boolean; // لتفعيل/تعطيل العملة

  @Column({ default: false })
  isPrimary: boolean; // هل هي العملة الأساسية (نضمن واحدة فقط لكل tenant عبر إندكس جزئي)
  
  @Column({ nullable: true })
  symbolAr: string; // الرمز العربي — مثال: "ل.س", "د.إ"
}
