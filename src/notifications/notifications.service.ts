import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../user/user.entity';
import { decodeCursor, encodeCursor, toEpochMs } from '../utils/pagination';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  // ========== أدوات عامة ==========
  private async mustGetUser(userId: string): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['currency'],
    });
    if (!user) throw new NotFoundException(`المستخدم ${userId} غير موجود`);
    return user;
  }

  private symbolFor(code?: string) {
    if (!code) return '';
    const map: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', TRY: '₺',
      SAR: '﷼', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق',
      BHD: 'ب.د', OMR: 'ر.ع', SYP: 'ل.س',
    };
    return map[code] ?? code;
  }

  private fmt(n: number) {
    // 12,345 -> 12.345
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
      .format(n)
      .replace(/,/g, '.');
  }

  private arStatus(s: 'approved' | 'rejected' | 'pending') {
    return s === 'approved' ? 'قبول' : s === 'rejected' ? 'رفض' : 'قيد المراجعة';
  }

  // ========== مُنشئ تنبيه عام ==========
  private async createTyped(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    meta?: Record<string, any>,
    opts?: {
      link?: string | null;
      channel?: 'in_app' | 'email' | 'sms';
      priority?: 'low' | 'normal' | 'high';
      isRead?: boolean;
    },
  ): Promise<Notification> {
    const user = await this.mustGetUser(userId);
    const notification = this.notificationsRepo.create({
      user,
      type,
      title,
      message,
      meta,
      link: opts?.link ?? null,
      channel: opts?.channel ?? 'in_app',
      priority: opts?.priority ?? 'normal',
      isRead: !!opts?.isRead,
      readAt: opts?.isRead ? new Date() : null,
    });
    return this.notificationsRepo.save(notification);
  }

  // ========== APIs أساسية ==========
  async findByUser(userId: string): Promise<Notification[]> {
    return this.notificationsRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  /** واجهة مع باجينيشن (keyset) — متوافقة مع /notifications و /notifications/mine */
  async listMineWithPagination(
    userId: string,
    dto: { limit?: number; cursor?: string | null },
  ) {
    const limit = Math.max(1, Math.min(100, Number(dto?.limit ?? 20)));
    const cursor = decodeCursor(dto?.cursor);

    const qb = this.notificationsRepo
      .createQueryBuilder('n')
      .where('n.user_id = :uid', { uid: userId });

    if (cursor) {
      qb.andWhere(new Brackets((b) => {
        b.where('n.createdAt < :cts', { cts: new Date(cursor.ts) })
         .orWhere(new Brackets(bb => {
            bb.where('n.createdAt = :cts', { cts: new Date(cursor.ts) })
              .andWhere('n.id < :cid', { cid: cursor.id });
         }));
      }));
    }

    qb.orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    const last = pageItems[pageItems.length - 1] || null;
    const nextCursor = last
      ? encodeCursor(toEpochMs((last as any).createdAt), String((last as any).id))
      : null;

    // نعيد العناصر كما هي (الفرونت يقرأ الحقول التالية)
    const items = pageItems.map((n) => ({
      id: n.id,
      title: n.title ?? null,
      message: n.message,
      link: n.link ?? null,
      isRead: n.isRead ?? false,
      createdAt: (n as any).createdAt?.toISOString?.() ?? new Date(n.createdAt as any).toISOString(),
    }));

    return {
      items,
      pageInfo: { nextCursor, hasMore },
      meta: { limit },
    };
  }

  /** يدعم تمرير userId اختياريًا للتحقق من الملكية دون كسر التوافق */
  async markAsRead(notificationId: string, userId?: string): Promise<Notification> {
    const notification = await this.notificationsRepo.findOne({
      where: { id: notificationId },
      relations: ['user'],
    });
    if (!notification) throw new NotFoundException(`التنبيه ${notificationId} غير موجود`);

    if (userId && notification.user?.id && notification.user.id !== userId) {
      // حماية إضافية اختيارية
      throw new ForbiddenException('لا تملك صلاحية تعديل هذا التنبيه');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationsRepo.save(notification);
    }
    return notification;
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationsRepo
      .createQueryBuilder()
      .update()
      .set({ isRead: true, readAt: () => 'NOW()' })
      .where(`"user_id" = :userId AND "isRead" = false`, { userId })
      .execute();
  }

  // ========== سيناريوهات منفصلة ==========
  /** خصم محفظة عام */
  async walletDebit(
    userId: string,
    amountUserCurrency: number,
    orderId?: string,
    ctx?: { packageName?: string; userIdentifier?: string }
  ) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;

    const pkg = ctx?.packageName ? ` للباقة «${ctx.packageName}»` : '';
    const uid = ctx?.userIdentifier ? ` (معرّف اللاعب ${ctx.userIdentifier})` : '';

    return this.createTyped(
      userId,
      'wallet_debit',
      'خصم من المحفظة',
      `تم خصم ${amountText} لإتمام عملية شراء${pkg}${uid}.`,
      { amount: amountUserCurrency, currencyCode: code, orderId, ...ctx },
      { channel: 'in_app', priority: 'normal', link: orderId ? `/orders/${orderId}` : null }
    );
  }

  /** شحن محفظة عام */
  async walletTopup(userId: string, amountUserCurrency: number, reason?: string) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;
    return this.createTyped(
      userId,
      'wallet_topup',
      'شحن رصيد المحفظة',
      `تم شحن المحفظة بمبلغ ${amountText} وإضافته إلى رصيدك${reason ? ` — ${reason}` : ''}.`,
      { amount: amountUserCurrency, currencyCode: code, reason },
      { channel: 'in_app', priority: 'normal' }
    );
  }

  /** إشعار موافقة إيداع (مخصص للإيداع) */
  async depositApproved(
    userId: string,
    amountUserCurrency: number,
    methodName?: string,
    meta?: Record<string, any>,
  ) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym  = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;
    const reason = methodName ? `إيداع عبر ${methodName}` : undefined;

    return this.createTyped(
      userId,
      'wallet_topup',
      'شحن رصيد المحفظة',
      `تم شحن المحفظة بمبلغ ${amountText} وإضافته إلى رصيدك${reason ? ` — ${reason}` : ''}.`,
      { amount: amountUserCurrency, currencyCode: code, methodName, ...(meta ?? {}) },
      { channel: 'in_app', priority: 'normal' }
    );
  }

  /** إشعار رفض إيداع (مخصص للإيداع) */
  async depositRejected(
    userId: string,
    originalAmount: number,
    originalCurrency: string,
    methodName?: string,
    meta?: Record<string, any>,
  ) {
    const methodTxt = methodName ? ` عبر ${methodName}` : '';
    const origTxt = `${this.fmt(originalAmount)} ${originalCurrency.toUpperCase()}`;
    return this.createTyped(
      userId,
      'announcement',
      'تم رفض طلب الإيداع',
      `تم رفض طلب الإيداع بمبلغ ${origTxt}${methodTxt}.`,
      { originalAmount, originalCurrency: originalCurrency.toUpperCase(), methodName, ...(meta ?? {}) },
      { channel: 'in_app', priority: 'normal' }
    );
  }

  // ========== تنبيه مدمج (غير إلزامي لكن مفيد) ==========
  async orderOutcome(
    userId: string,
    orderId: string,
    outcome: 'approved' | 'rejected',
    opts?: {
      packageName?: string;
      userIdentifier?: string;
      amountUserCurrency?: number; // موجب = استرجاع، سالب = خصم
      mentionRefund?: boolean;     // افتراضي: false (للرفض فقط)
    },
  ) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);
    const pkg = opts?.packageName ? `«${opts.packageName}»` : 'المحددة';
    const uid = opts?.userIdentifier ? ` ومعرّف اللاعب ${opts.userIdentifier}` : '';
    const amt = opts?.amountUserCurrency ?? 0;
    const absAmtText = amt ? ` ${this.fmt(Math.abs(amt))} ${sym}` : '';

    let title = '';
    let message = '';

    if (outcome === 'approved') {
      title = 'تم القبول ✅';
      message = `تم شحن طلبك للباقة ${pkg}${uid} بنجاح.`;
      if (amt < 0) {
        message += ` وخصم${absAmtText} من رصيدك.`;
      }
    } else {
      title = 'تم الرفض ❌';
      message = `تم رفض طلبك للباقة ${pkg}${uid}.`;
      if ((opts?.mentionRefund ?? false) && amt > 0) {
        message += ` وتمّت إعادة${absAmtText} إلى رصيدك.`;
      }
    }

    return this.createTyped(
      userId,
      'order_status_changed',
      title,
      message,
      {
        orderId,
        fromStatus: outcome === 'approved' ? 'pending' : 'pending',
        toStatus: outcome,
        deltaAmount: amt,
        currencyCode: code,
        packageName: opts?.packageName,
        userIdentifier: opts?.userIdentifier,
      },
      { channel: 'in_app', priority: 'normal', link: `/orders/${orderId}` }
    );
  }

  // ========== توافق خلفي: تغيير حالة الطلب ==========
  async orderStatusChanged(
    userId: string,
    orderId: string,
    fromStatus: 'approved' | 'rejected' | 'pending',
    toStatus: 'approved' | 'rejected' | 'pending',
    deltaOrOpts?: number | {
      deltaAmountUserCurrency?: number;
      packageName?: string;
      userIdentifier?: string;
    },
  ) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);

    const opts = typeof deltaOrOpts === 'number'
      ? { deltaAmountUserCurrency: deltaOrOpts }
      : (deltaOrOpts ?? {});

    const pkgName = opts.packageName ? `«${opts.packageName}»` : 'المحددة';
    const uidText = opts.userIdentifier ? `معرّف اللاعب ${opts.userIdentifier}` : '';
    const label = uidText ? `${pkgName}، ${uidText}` : pkgName;

    const amount = opts.deltaAmountUserCurrency ?? 0;
    const hasAmount = typeof opts.deltaAmountUserCurrency === 'number';
    const amountText = hasAmount ? ` (${this.fmt(Math.abs(amount))} ${sym})` : '';

    let title = 'تغيير في حالة الطلب';
    let message: string;

    if (toStatus === 'approved' && fromStatus !== 'approved') {
      title = 'تم القبول ✅';
      message = `تم شحن طلبك للباقة ${pkgName}${opts.userIdentifier ? ` ومعرّف اللاعب ${opts.userIdentifier}` : ''} بنجاح.`;
      if (hasAmount && amount < 0) message += ` تم خصم المبلغ من رصيدك${amountText}.`;
    } else if (toStatus === 'rejected' && fromStatus !== 'rejected') {
      title = 'تم الرفض ❌';
      message = `تم رفض طلبك للباقة ${pkgName}${opts.userIdentifier ? ` ومعرّف اللاعب ${opts.userIdentifier}` : ''}.`;
    } else if (fromStatus === 'approved' && toStatus === 'rejected') {
      message = `تم تغيير الطلب (${label}) من حالة قبول إلى رفض.`;
    } else if (fromStatus === 'rejected' && toStatus === 'approved') {
      message = `تم تغيير الطلب (${label}) من حالة رفض إلى قبول.`;
    } else {
      message = `تم تغيير حالة الطلب (${label}) من ${this.arStatus(fromStatus)} إلى ${this.arStatus(toStatus)}.`;
      if (hasAmount) {
        message += amount > 0
          ? ` تمّت إعادة مبلغ إلى رصيدك${amountText}.`
          : amount < 0
          ? ` تم خصم مبلغ من رصيدك${amountText}.`
          : '';
      }
    }

    return this.createTyped(
      userId,
      'order_status_changed',
      title,
      message,
      {
        orderId,
        fromStatus,
        toStatus,
        deltaAmount: amount,
        currencyCode: code,
        packageName: opts.packageName,
        userIdentifier: opts.userIdentifier,
      },
      { channel: 'in_app', priority: 'normal', link: `/orders/${orderId}` }
    );
  }

  // ========== إعلان عام ==========
  async announceForAll(
    title: string,
    message: string,
    opts?: { link?: string; channel?: 'in_app' | 'email' | 'sms'; priority?: 'low' | 'normal' | 'high' },
  ) {
    const users = await this.usersRepo.find({ where: { role: In(['user', 'admin']) } });
    const notifs = users.map((u) =>
      this.notificationsRepo.create({
        user: u,
        type: 'announcement',
        title,
        message,
        isRead: false,
        readAt: null,
        link: opts?.link ?? null,
        channel: opts?.channel ?? 'in_app',
        priority: opts?.priority ?? 'normal',
      }),
    );
    await this.notificationsRepo.save(notifs);
    return { count: notifs.length };
  }
}
