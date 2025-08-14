import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { ProductOrder } from './product-order.entity';
import { OrderDispatchLog } from './order-dispatch-log.entity';
import { IntegrationsService } from '../integrations/integrations.service';
import { ProductsService } from './products.service';

type ExternalStatus = 'not_sent' | 'queued' | 'sent' | 'processing' | 'done' | 'failed';

@Injectable()
export class OrdersMonitorService {
  private readonly logger = new Logger(OrdersMonitorService.name);

  constructor(
    @InjectRepository(ProductOrder)
    private readonly orderRepo: Repository<ProductOrder>,

    @InjectRepository(OrderDispatchLog)
    private readonly logRepo: Repository<OrderDispatchLog>,

    private readonly integrations: IntegrationsService,
    private readonly productsService: ProductsService,
  ) {}

  /** كل 5 ثواني — مراجعة الطلبات الخارجية المعلّقة */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async checkPendingOrders() {
    // نجلب فقط ما يحتاج متابعة حقًا
    const orders = await this.orderRepo.find({
      where: { externalStatus: In(['sent', 'processing']) },
      take: 10,
    });
    if (!orders.length) return;

    for (const order of orders) {
      try {
        // ✅ حماية: لا تفحص طلب منتهي داخليًا أو بلا معلومات مزوّد
        if (
          !order.providerId ||
          !order.externalOrderId ||
          order.status === 'approved' ||
          order.status === 'rejected' ||
          order.externalStatus === 'done' ||
          order.externalStatus === 'failed'
        ) {
          continue;
        }

        const res = await this.integrations.checkOrders(order.providerId, [order.externalOrderId]);
        const first = Array.isArray(res) ? res[0] : (res as any);

        // ✅ نعطي أولوية للماب الجاهز من الدرايفر: success|pending|failed
        let statusRaw: string | undefined = first?.mappedStatus;

        // ✅ Fallback: لو providerStatus = 1/2/3 حسب ما ثبّتّوه:
        // 1 = pending (انتظار) | 2 = success (قبول) | 3 = failed (رفض)
        if (!statusRaw) {
          const code = String(first?.providerStatus ?? '').trim();
          if (code === '1') statusRaw = 'pending';
          else if (code === '2') statusRaw = 'success';
          else if (code === '3') statusRaw = 'failed';
        }

        // ✅ آخر fallback لباقي الحقول المعتادة
        statusRaw =
          statusRaw ??
          (first as any)?.status ??
          (first as any)?.state ??
          (first as any)?.orderStatus ??
          (first as any)?.providerStatus ??
          'processing';

        const message: string =
          (first?.raw && (first.raw.message || first.raw.desc || first.raw.raw || first.raw.text)) ||
          'sync';

        // طبّق توحيد الحالات ثم خزّن
        const extStatus = this.normalizeExternalStatus(statusRaw || 'processing');

        order.externalStatus = extStatus;
        order.lastSyncAt = new Date();
        order.lastMessage = String(message || '').slice(0, 250);

        const isTerminal = extStatus === 'done' || extStatus === 'failed';
        if (isTerminal) {
          order.completedAt = new Date();
          order.durationMs = order.sentAt ? order.completedAt.getTime() - order.sentAt.getTime() : 0;
          await this.orderRepo.save(order);

          if (extStatus === 'done') {
            await this.productsService.updateOrderStatus(order.id, 'approved');
          } else {
            await this.productsService.updateOrderStatus(order.id, 'rejected');
          }
        } else {
          await this.orderRepo.save(order);
        }

        await this.logRepo.save(
          this.logRepo.create({
            order,
            action: 'refresh',
            result: extStatus === 'failed' ? 'fail' : 'success',
            message,
            payloadSnapshot: { response: res },
          }),
        );
      } catch (err: any) {
        const msg = String(err?.message ?? 'فشل تحديث الحالة').slice(0, 250);
        await this.logRepo.save(
          this.logRepo.create({
            order,
            action: 'refresh',
            result: 'fail',
            message: msg,
          }),
        );
        this.logger.error(`فشل تحديث الطلب ${order.id}: ${msg}`);
      }
    }
  }

  /** توحيد حالات المزوّد إلى ExternalStatus */
  private normalizeExternalStatus(raw: string): ExternalStatus {
    const s = (raw || '').toString().toLowerCase();
    // قبول نهائي
    if (['success', 'completed', 'complete', 'ok', 'done'].includes(s)) return 'done';
    // رفض/فشل نهائي
    if (['fail', 'failed', 'error', 'rejected', 'cancelled', 'canceled'].includes(s)) return 'failed';
    // أرسل/مصفوف
    if (['sent', 'queued', 'queue', 'accepted'].includes(s)) return 'sent';
    // قيد التنفيذ/انتظار
    if (['processing', 'inprogress', 'running', 'pending', '1'].includes(s)) return 'processing';
    return 'processing';
  }
}
