import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { Deposit, DepositStatus } from './deposit.entity';
import { PaymentMethod } from './payment-method.entity';
import { User } from '../user/user.entity';
import { Currency } from '../currencies/currency.entity';

import { CreateDepositDto } from './dto/create-deposit.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DepositsService {
  constructor(
    @InjectRepository(Deposit) private depositsRepo: Repository<Deposit>,
    @InjectRepository(PaymentMethod) private methodsRepo: Repository<PaymentMethod>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Currency) private currenciesRepo: Repository<Currency>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  private async getRate(code: string): Promise<number> {
    const c = await this.currenciesRepo.findOne({ where: { code } as any });
    if (!c) throw new NotFoundException(`العملة ${code} غير موجودة`);
    const r: any = (c as any).rate ?? (c as any).value ?? null;
    if (r === null || r === undefined) {
      throw new BadRequestException(`لا يوجد سعر صرف للعملة ${code}`);
    }
    return Number(r);
  }

  /** المستخدم: إنشاء طلب إيداع Pending */
  async createDeposit(userId: string, dto: CreateDepositDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } as any });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const method = await this.methodsRepo.findOne({ where: { id: dto.methodId } });
    if (!method || !method.isActive) throw new BadRequestException('وسيلة الدفع غير متاحة');

    if (dto.originalAmount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');

    const originalCurrency = dto.originalCurrency.toUpperCase();
    const walletCurrency = dto.walletCurrency.toUpperCase();

    const rFrom = await this.getRate(originalCurrency);
    const rTo = await this.getRate(walletCurrency);

    const ratio = rTo / rFrom; // كم يساوي 1 من العملة المرسلة بوحدة عملة المحفظة
    const convertedAmount = Number(dto.originalAmount) * ratio;

    const entity = this.depositsRepo.create({
      user_id: user.id,
      method_id: method.id,
      originalAmount: dto.originalAmount.toString(),
      originalCurrency,
      walletCurrency,
      rateUsed: ratio.toString(),
      convertedAmount: convertedAmount.toFixed(6),
      note: dto.note ?? null,
      status: DepositStatus.PENDING,
    });

    return this.depositsRepo.save(entity);
  }

  /** المستخدم: طلباتي */
  findMy(userId: string) {
    return this.depositsRepo.find({
      where: { user_id: userId } as any,
      relations: { method: true }, // ✅ لعرض اسم الوسيلة بالشاشة
      order: { createdAt: 'DESC' },
    });
  }

  /** المشرف: جميع الطلبات */
  findAllAdmin() {
    return this.depositsRepo.find({
      relations: { user: true, method: true }, // ✅ لعرض المستخدم والوسيلة
      order: { createdAt: 'DESC' },
    });
  }

  /** المشرف: تغيير الحالة + شحن المحفظة عند الموافقة */
  async setStatus(id: string, newStatus: DepositStatus) {
    return this.dataSource.transaction(async (manager) => {
      // نقرأ الطلب مع علاقاته لرسائل أوضح
      const dep = await manager.findOne(Deposit, {
        where: { id },
        relations: { user: true, method: true },
      });
      if (!dep) throw new NotFoundException('طلب الإيداع غير موجود');

      const oldStatus = dep.status;

      // منع تعديل طلب موافَق مسبقًا (لتفادي شحن مزدوج)
      if (oldStatus === DepositStatus.APPROVED && newStatus !== DepositStatus.APPROVED) {
        throw new BadRequestException('لا يمكن تعديل طلب تمّت الموافقة عليه مسبقًا.');
      }

      // احفظ الحالة الجديدة
      dep.status = newStatus;
      await manager.save(dep);

      // عند الانتقال من pending -> approved: اشحن الرصيد + أرسل إشعار شحن
      if (oldStatus === DepositStatus.PENDING && newStatus === DepositStatus.APPROVED) {
        const user = await manager.findOne(User, { where: { id: dep.user_id } as any });
        if (!user) throw new NotFoundException('المستخدم غير موجود');

        const current = Number(user.balance ?? 0);
        const add = Number(dep.convertedAmount ?? 0);
        user.balance = (current + add) as any;
        await manager.save(user);

        // 🔔 إشعار موافقة إيداع واضح
        await this.notifications.depositApproved(
          dep.user_id,
          add,
          dep.method?.name ?? undefined,
          { depositId: dep.id }
        );
      }

      // عند الرفض: إشعار رفض واضح
      if (oldStatus !== DepositStatus.REJECTED && newStatus === DepositStatus.REJECTED) {
        await this.notifications.depositRejected(
          dep.user_id,
          Number(dep.originalAmount ?? 0),
          dep.originalCurrency,
          dep.method?.name ?? undefined,
          { depositId: dep.id }
        );
      }

      return dep;
    });
  }
}
