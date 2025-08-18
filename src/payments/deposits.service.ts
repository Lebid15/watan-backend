import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets } from 'typeorm';

import { Deposit, DepositStatus } from './deposit.entity';
import { PaymentMethod } from './payment-method.entity';
import { User } from '../user/user.entity';
import { Currency } from '../currencies/currency.entity';

import { CreateDepositDto } from './dto/create-deposit.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ListDepositsDto } from './dto/list-deposits.dto';
import { decodeCursor, encodeCursor, toEpochMs } from '../utils/pagination';

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

    const ratio = rTo / rFrom;
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

  /** ✅ (توافق خلفي) مصفوفة بسيطة بدون باجينيشن */
  findMy(userId: string) {
    return this.depositsRepo.find({
      where: { user_id: userId } as any,
      relations: { method: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** ✅ جديد: المستخدم — باجينيشن cursor { items, pageInfo } */
  async listMineWithPagination(
    userId: string,
    dto: { limit?: number; cursor?: string | null },
  ) {
    const limit = Math.max(1, Math.min(100, dto.limit ?? 20));
    const cursor = decodeCursor(dto.cursor);

    const qb = this.depositsRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.method', 'm')
      .where('d.user_id = :uid', { uid: userId });

    // Keyset: createdAt DESC, id DESC
    if (cursor) {
      qb.andWhere(new Brackets((b) => {
        b.where('d.createdAt < :cts', { cts: new Date(cursor.ts) })
         .orWhere(new Brackets((bb) => {
           bb.where('d.createdAt = :cts', { cts: new Date(cursor.ts) })
             .andWhere('d.id < :cid', { cid: cursor.id });
         }));
      }));
    }

    qb.orderBy('d.createdAt', 'DESC')
      .addOrderBy('d.id', 'DESC')
      .take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    const last = pageItems[pageItems.length - 1] || null;
    const nextCursor = last
      ? encodeCursor(toEpochMs((last as any).createdAt), String((last as any).id))
      : null;

    const items = pageItems.map((d) => {
      const dx = d as any;

      const originalAmount = Number(dx.originalAmount ?? dx.amount ?? 0);
      const originalCurrency = String(dx.originalCurrency ?? dx.currency ?? 'USD');

      const rateUsed = Number(dx.rateUsed ?? dx.fxRate ?? dx.rate ?? 1);

      let convertedAmount = Number(dx.convertedAmount ?? dx.amountConverted ?? dx.amount_wallet ?? NaN);
      if (!Number.isFinite(convertedAmount)) {
        convertedAmount = Number((originalAmount || 0) * (rateUsed || 1));
      }

      const walletCurrency = String(dx.walletCurrency ?? dx.wallet_currency ?? 'TRY');

      return {
        id: dx.id,
        method: dx.method
          ? {
              id: dx.method.id,
              name: (dx.method as any).name ?? '',
              type: (dx.method as any).type ?? undefined,
              logoUrl: (dx.method as any).logoUrl ?? (dx.method as any).imageUrl ?? null,
            }
          : null,
        originalAmount,
        originalCurrency,
        walletCurrency,
        rateUsed,
        convertedAmount,
        note: dx.note ?? null,
        status: dx.status,
        createdAt: dx.createdAt,
      };
    });

    return {
      items,
      pageInfo: { nextCursor, hasMore },
      meta: {
        limit,
      },
    };
  }

  /** المشرف: جميع الطلبات (بسيط) */
  findAllAdmin() {
    return this.depositsRepo.find({
      relations: { user: true, method: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * المشرف: تغيير الحالة مع عكس أثر الرصيد عند التحويل بين (approved/rejected)
   * القواعد:
   * - pending -> approved: شحن الرصيد بقيمة convertedAmount
   * - pending -> rejected: لا شيء
   * - rejected -> approved: شحن الرصيد بقيمة convertedAmount
   * - approved -> rejected: خصم نفس قيمة convertedAmount
   * - أي انتقال إلى pending بعد قرار نهائي: غير مسموح
   * - نفس الحالة: لا شيء
   */
/** تغيير الحالة مع تعديل الرصيد، بلا أقفال صريحة وبلا انتظار إشعارات */
  async setStatus(id: string, newStatus: DepositStatus) {
    return this.dataSource.transaction(async (manager) => {
      // 1) اجلب الإيداع (بدون FOR UPDATE)
      const dep = await manager.findOne(Deposit, { where: { id } as any });
      if (!dep) throw new NotFoundException('طلب الإيداع غير موجود');

      const oldStatus = dep.status;
      if (newStatus === oldStatus) return dep;

      if (newStatus === DepositStatus.PENDING && oldStatus !== DepositStatus.PENDING) {
        throw new BadRequestException('لا يمكن إعادة الحالة إلى قيد المراجعة بعد اتخاذ القرار.');
      }

      // 2) احسب delta
      const amount = Number((dep as any).convertedAmount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('قيمة التحويل غير صالحة لهذا الإيداع.');
      }

      let delta = 0;
      if (newStatus === DepositStatus.APPROVED && oldStatus !== DepositStatus.APPROVED) {
        // pending/rejected -> approved
        delta = amount;
      } else if (oldStatus === DepositStatus.APPROVED && newStatus !== DepositStatus.APPROVED) {
        // approved -> rejected
        delta = -amount;
      }

      // 3) طبّق التعديل على الرصيد بعملية increment مباشرة (تجنّب قفل يدوي)
      if (delta !== 0) {
        // تقليم لخانتين لأن balance = DECIMAL(12,2)
        const deltaRounded = Number((Math.round(delta * 100) / 100).toFixed(2));
        await manager
          .createQueryBuilder()
          .update(User)
          .set({ balance: () => `ROUND(COALESCE(balance,0) + (${deltaRounded}), 2)` })
          .where('id = :uid', { uid: dep.user_id })
          .execute();
      }

      // 4) حدّث حالة الإيداع واحفظ
      dep.status = newStatus;
      await manager.save(dep);

      // 5) أرسل الإشعارات "Fire-and-forget" بعد نجاح الترنزكشن — لا تنتظرها
      setImmediate(() => {
        try {
          if (newStatus === DepositStatus.APPROVED) {
            void this.notifications.depositApproved(dep.user_id, amount, undefined, { depositId: dep.id });
          } else if (newStatus === DepositStatus.REJECTED) {
            const origAmt = Number((dep as any).originalAmount ?? 0);
            const origCur = (dep as any).originalCurrency;
            void this.notifications.depositRejected(dep.user_id, origAmt, origCur, undefined, { depositId: dep.id });
          }
        } catch { /* تجاهل أي فشل بالإشعار */ }
      });

      return dep;
    });
  }
  
  /** المشرف: قائمة الإيداعات مع باجينيشن */
  async listWithPagination(dto: ListDepositsDto) {
    const limit = Math.max(1, Math.min(100, dto.limit ?? 25));
    const cursor = decodeCursor(dto.cursor);

    const qb = this.depositsRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'u')
      .leftJoinAndSelect('d.method', 'm');

    if (dto.status) qb.andWhere('d.status = :status', { status: dto.status });
    if (dto.methodId) qb.andWhere('m.id = :mid', { mid: dto.methodId });
    if (dto.from) qb.andWhere('d.createdAt >= :from', { from: new Date(dto.from + 'T00:00:00Z') });
    if (dto.to) qb.andWhere('d.createdAt <= :to', { to: new Date(dto.to + 'T23:59:59Z') });

    const qRaw = (dto.q || '').trim();
    if (qRaw) {
      const isDigits = /^\d+$/.test(qRaw);
      if (isDigits) {
        qb.andWhere('CAST(d.id AS TEXT) ILIKE :qexact', { qexact: qRaw });
      } else {
        const q = `%${qRaw.toLowerCase()}%`;
        qb.andWhere(new Brackets((b) => {
          b.where('LOWER(COALESCE(d.note, \'\')) LIKE :q', { q })
           .orWhere('LOWER(COALESCE(u.username, \'\')) LIKE :q', { q })
           .orWhere('LOWER(COALESCE(u.email, \'\')) LIKE :q', { q })
           .orWhere('LOWER(COALESCE(m.name, \'\')) LIKE :q', { q });
        }));
      }
    }

    if (cursor) {
      qb.andWhere(new Brackets(b => {
        b.where('d.createdAt < :cts', { cts: new Date(cursor.ts) })
         .orWhere(new Brackets(bb => {
           bb.where('d.createdAt = :cts', { cts: new Date(cursor.ts) })
             .andWhere('d.id < :cid', { cid: cursor.id });
         }));
      }));
    }

    qb.orderBy('d.createdAt', 'DESC')
      .addOrderBy('d.id', 'DESC')
      .take(limit + 1);

    const rows = await qb.getMany();

    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    const last = pageItems[pageItems.length - 1] || null;
    const nextCursor = last ? encodeCursor(toEpochMs((last as any).createdAt), String((last as any).id)) : null;

    const items = pageItems.map((d) => {
      const dx = d as any;
      const originalAmount = Number(dx.originalAmount ?? dx.amount ?? 0);
      const originalCurrency = String(dx.originalCurrency ?? dx.currency ?? 'USD');
      const rateUsed = Number(dx.rateUsed ?? dx.fxRate ?? dx.rate ?? 1);

      let convertedAmount = Number(dx.convertedAmount ?? dx.amountConverted ?? dx.amount_wallet ?? NaN);
      if (!Number.isFinite(convertedAmount)) {
        convertedAmount = Number((originalAmount || 0) * (rateUsed || 1));
      }

      const walletCurrency = String(dx.walletCurrency ?? dx.wallet_currency ?? 'TRY');

      return {
        id: dx.id,
        user: dx.user
          ? {
              id: dx.user.id,
              email: (dx.user as any).email ?? undefined,
              fullName: (dx.user as any).fullName ?? undefined,
              username: (dx.user as any).username ?? undefined,
            }
          : null,
        method: dx.method
          ? {
              id: dx.method.id,
              name: (dx.method as any).name ?? '',
              type: (dx.method as any).type ?? undefined,
            }
          : null,
        originalAmount,
        originalCurrency,
        rateUsed,
        convertedAmount,
        walletCurrency,
        note: dx.note ?? null,
        status: dx.status,
        createdAt: dx.createdAt,
      };
    });

    return {
      items,
      pageInfo: { nextCursor, hasMore },
      meta: {
        limit,
        appliedFilters: {
          q: dto.q || '',
          status: dto.status || '',
          methodId: dto.methodId || '',
          from: dto.from || '',
          to: dto.to || '',
        },
      },
    };
  }
}
