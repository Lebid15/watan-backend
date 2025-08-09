import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../user/user.entity';

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
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
      .format(n)
      .replace(/,/g, '.');
  }

  // ✅ نسخة مُحدّثة تدعم readAt/link/channel/priority
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

  async markAsRead(notificationId: string): Promise<Notification> {
    const notification = await this.notificationsRepo.findOne({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException(`التنبيه ${notificationId} غير موجود`);
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

  // ========== سيناريوهاتنا ==========
  /** خصم محفظة عند إنشاء طلب */
  async walletDebit(userId: string, amountUserCurrency: number, orderId?: string) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;
    return this.createTyped(
      userId,
      'wallet_debit',
      'تم خصم رصيد من محفظتك',
      `تم خصم ${amountText} لإتمام عملية شراء${orderId ? ` (طلب #${orderId})` : ''}.`,
      { amount: amountUserCurrency, currencyCode: code, orderId },
      { channel: 'in_app', priority: 'normal', link: orderId ? `/orders/${orderId}` : null }
    );
  }

  /** شحن محفظة */
  async walletTopup(userId: string, amountUserCurrency: number, reason?: string) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);
    const amountText = `${this.fmt(amountUserCurrency)} ${sym}`;
    return this.createTyped(
      userId,
      'wallet_topup',
      'تم شحن محفظتك',
      `تم إضافة ${amountText} إلى محفظتك${reason ? ` — ${reason}` : ''}.`,
      { amount: amountUserCurrency, currencyCode: code, reason },
      { channel: 'in_app', priority: 'normal' }
    );
  }

  /** تبدّل حالة الطلب */
  async orderStatusChanged(
    userId: string,
    orderId: string,
    fromStatus: 'approved' | 'rejected' | 'pending',
    toStatus: 'approved' | 'rejected' | 'pending',
    deltaAmountUserCurrency?: number,
  ) {
    const user = await this.mustGetUser(userId);
    const code = user.currency?.code ?? 'USD';
    const sym = this.symbolFor(code);

    let msgCore = `تغيّرت حالة طلبك (رقم ${orderId}) من ${fromStatus} إلى ${toStatus}.`;
    if (deltaAmountUserCurrency && deltaAmountUserCurrency !== 0) {
      const amountText = `${this.fmt(Math.abs(deltaAmountUserCurrency))} ${sym}`;
      msgCore += deltaAmountUserCurrency > 0
        ? ` تمّت إعادة ${amountText} إلى محفظتك.`
        : ` تم خصم ${amountText} من محفظتك.`;
    }

    return this.createTyped(
      userId,
      'order_status_changed',
      'تغيّر حالة الطلب',
      msgCore,
      {
        orderId,
        fromStatus,
        toStatus,
        deltaAmount: deltaAmountUserCurrency ?? 0,
        currencyCode: code,
      },
      { channel: 'in_app', priority: 'normal', link: `/orders/${orderId}` }
    );
  }

  /** إعلان عام: نولّد Notification لكل المستخدمين */
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
