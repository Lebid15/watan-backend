// backend/src/notifications/notifications.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets, DeepPartial } from 'typeorm';
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

  /** يجلب المستخدم ويتحقق من انتمائه للمستأجر */
  private async mustGetUserInTenant(userId: string, tenantId: string): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id: userId, tenantId } as any,
      relations: ['currency'],
    });
    if (!user) throw new NotFoundException(`المستخدم غير موجود ضمن هذا المستأجر`);
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

  // ========== مُنشئ تنبيه عام (مع فرض المستأجر) ==========
  private async createTyped(
    userId: string,
    tenantId: string,
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
    const user = await this.mustGetUserInTenant(userId, tenantId);

    const hasTenantIdColumn =
      !!(this.notificationsRepo?.metadata as any)?.propertiesMap &&
      'tenantId' in (this.notificationsRepo.metadata.propertiesMap as any);

    // ✅ حدّد المدخلات كـ DeepPartial<Notification>
    const base: DeepPartial<Notification> = {
      user,
      type: type as any,                       // إن كان enum
      title,
      message,
      meta,
      link: opts?.link ?? null,
      channel: (opts?.channel ?? 'in_app') as any,   // إن كان enum
      priority: (opts?.priority ?? 'normal') as any, // إن كان enum
      isRead: !!opts?.isRead,
      readAt: opts?.isRead ? new Date() : null,
      ...(hasTenantIdColumn ? { tenantId } : {}),
    };

    // ✅ create لعنصر واحد → يعيد Notification
    const notification = this.notificationsRepo.create(base);

    // ✅ ثبّت الأوفرلود الفردي صراحةً
    const saved = await this.notificationsRepo.save<Notification>(notification);
    return saved;
  }
  // ========== APIs أساسية مع فرض tenantId ==========

  /** جميع التنبيهات لمستخدم ضمن نفس المستأجر (بسيط) */
  async findByUser(userId: string, tenantId: string): Promise<Notification[]> {
    await this.mustGetUserInTenant(userId, tenantId);
    return this.notificationsRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  /** واجهة مع باجينيشن (keyset) — متوافقة مع /notifications و /notifications/mine */
  async listMineWithPagination(
    userId: string,
    tenantId: string,
    dto: { limit?: number; cursor?: string | null },
  ) {
    await this.mustGetUserInTenant(userId, tenantId);

    const limit = Math.max(1, Math.min(100, Number(dto?.limit ?? 20)));
    const cursor = decodeCursor(dto?.cursor);

    const qb = this.notificationsRepo
      .createQueryBuilder('n')
      .where('n.user_id = :uid', { uid: userId });

    // Keyset: createdAt DESC, id DESC
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

  /** يدعم تمرير userId اختياريًا للتحقق من الملكية دون كسر التوافق — مع فرض tenantId */
  async markAsRead(notificationId: string, tenantId: string, userId?: string): Promise<Notification> {
    const notification = await this.notificationsRepo.findOne({
      where: { id: notificationId },
      relations: ['user'],
    });
    if (!notification) throw new NotFoundException(`التنبيه ${notificationId} غير موجود`);

    // تحقق المستأجر
    if (!notification.user?.id) throw new NotFoundException('صاحب التنبيه غير معروف');
    await this.mustGetUserInTenant(notification.user.id, tenantId);

    if (userId && notification.user.id !== userId) {
      throw new ForbiddenException('لا تملك صلاحية تعديل هذا التنبيه');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationsRepo.save(notification);
    }
    return notification;
  }

  /** وسم جميع تنبيهات المستخدم كمقروءة — مع فرض tenantId */
  async markAllAsRead(userId: string, tenantId: string): Promise<void> {
    // تأكيد الانتماء للمستأجر
    await this.mustGetUserInTenant(userId, tenantId);

    // لا نعتمد على حقل tenantId في جدول التنبيهات (قد لا يوجد)
    await this.notificationsRepo
      .createQueryBuilder()
      .update()
      .set({ isRead: true, readAt: () => 'NOW()' })
      .where(`"user_id" = :userId AND "isRead" = false`, { userId })
      .execute();
  }

  // ========== سيناريوهات منفصلة (أضفنا tenantId لكل دالة) ==========

  /** خصم محفظة عام */
  async walletDebit(
    userId: string,
    tenantId: string,
    amountUserCurrency: number,
    orderId?: string,
    ctx?: { packageName?: string; userIdentifier?: string }
  ) {
    const user = await this.mustGetUserInTenant(userId, tenantId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;

    const pkg = ctx?.packageName ? ` للباقة «${ctx.packageName}»` : '';
    const uid = ctx?.userIdentifier ? ` (معرّف اللاعب ${ctx.userIdentifier})` : '';

    return this.createTyped(
      userId,
      tenantId,
      'wallet_debit',
      'خصم من المحفظة',
      `تم خصم ${amountText} لإتمام عملية شراء${pkg}${uid}.`,
      { amount: amountUserCurrency, currencyCode: code, orderId, ...ctx },
      { channel: 'in_app', priority: 'normal', link: orderId ? `/orders/${orderId}` : null }
    );
  }

  /** شحن محفظة عام */
  async walletTopup(userId: string, tenantId: string, amountUserCurrency: number, reason?: string) {
    const user = await this.mustGetUserInTenant(userId, tenantId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;
    return this.createTyped(
      userId,
      tenantId,
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
    tenantId: string,
    amountUserCurrency: number,
    methodName?: string,
    meta?: Record<string, any>,
  ) {
    const user = await this.mustGetUserInTenant(userId, tenantId);
    const code = user.currency?.code ?? 'USD';
    const sym  = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;
    const reason = methodName ? `إيداع عبر ${methodName}` : undefined;

    return this.createTyped(
      userId,
      tenantId,
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
    tenantId: string,
    originalAmount: number,
    originalCurrency: string,
    methodName?: string,
    meta?: Record<string, any>,
  ) {
    await this.mustGetUserInTenant(userId, tenantId);
    const methodTxt = methodName ? ` عبر ${methodName}` : '';
    const origTxt = `${this.fmt(originalAmount)} ${originalCurrency.toUpperCase()}`;
    return this.createTyped(
      userId,
      tenantId,
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
    tenantId: string,
    orderId: string,
    outcome: 'approved' | 'rejected',
    opts?: {
      packageName?: string;
      userIdentifier?: string;
      amountUserCurrency?: number; // موجب = استرجاع، سالب = خصم
      mentionRefund?: boolean;     // افتراضي: false (للرفض فقط)
    },
  ) {
    const user = await this.mustGetUserInTenant(userId, tenantId);
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
      tenantId,
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
    tenantId: string,
    orderId: string,
    fromStatus: 'approved' | 'rejected' | 'pending',
    toStatus: 'approved' | 'rejected' | 'pending',
    deltaOrOpts?: number | {
      deltaAmountUserCurrency?: number;
      packageName?: string;
      userIdentifier?: string;
    },
  ) {
    const user = await this.mustGetUserInTenant(userId, tenantId);
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
      tenantId,
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

  // ========== إعلان عام (على مستوى المستأجر فقط) ==========
  async announceForAll(
    tenantId: string,
    title: string,
    message: string,
    opts?: { link?: string; channel?: 'in_app' | 'email' | 'sms'; priority?: 'low' | 'normal' | 'high' },
  ): Promise<{ count: number }> {
    const users = await this.usersRepo.find({
      where: { tenantId, role: In(['user', 'admin']) } as any,
    });

    const hasTenantIdColumn =
      !!(this.notificationsRepo?.metadata as any)?.propertiesMap &&
      'tenantId' in (this.notificationsRepo.metadata.propertiesMap as any);

    // ابنِ مدخلات واضحة بنوع DeepPartial<Notification> حتى يختار create/save الأوفرلود الفردي
    const inputs: DeepPartial<Notification>[] = users.map((u) => {
      const base: DeepPartial<Notification> = {
        user: u,
        type: 'announcement' as any,
        title,
        message,
        isRead: false,
        readAt: null,
        link: opts?.link ?? null,
        channel: (opts?.channel ?? 'in_app') as any,
        priority: (opts?.priority ?? 'normal') as any,
      };
      return hasTenantIdColumn ? { ...base, tenantId } : base;
    });

    // create يُرجع Notification[] عند تمرير مصفوفة DeepPartial
    const notifs = this.notificationsRepo.create(inputs);
    await this.notificationsRepo.save(notifs); // save(Notification[]) — أوفرلود المصفوفة

    return { count: notifs.length };
  }

}
