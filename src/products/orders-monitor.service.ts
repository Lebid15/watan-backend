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

        // ===================== استخراج الحالة/الملاحظة/PIN =====================
        // أولوية للماب الجاهز من الدرايفر: success|pending|failed
        let statusRaw: string | undefined = first?.mappedStatus;

        // Fallback: providerStatus = 1/2/3 → نطبّق الخريطة المطلوبة
        // 1 = pending (قيد المعالجة) | 2 = success (ناجح) | 3 = failed (مرفوض)
        if (!statusRaw) {
          const code = String(first?.providerStatus ?? '').trim();
          if (code === '1') statusRaw = 'pending';
          else if (code === '2') statusRaw = 'success';
          else if (code === '3') statusRaw = 'failed';
        }

        // آخر fallback
        statusRaw =
          statusRaw ??
          (first as any)?.status ??
          (first as any)?.state ??
          (first as any)?.orderStatus ??
          (first as any)?.providerStatus ??
          'processing';

        // note من الدرايفر أو من الحقول الشائعة في الرد الخام
        const note: string | undefined =
          (first as any)?.note?.toString?.().trim?.() ||
          (first?.raw as any)?.desc?.toString?.().trim?.() ||
          (first?.raw as any)?.note?.toString?.().trim?.() ||
          (first?.raw as any)?.message?.toString?.().trim?.() ||
          (first?.raw as any)?.text?.toString?.().trim?.();

        // pin من الدرايفر أو من الرد الخام
        const pin: string | undefined =
          (first as any)?.pin != null
            ? String((first as any)?.pin).trim()
            : (first?.raw as any)?.pin != null
              ? String((first?.raw as any)?.pin).trim()
              : undefined;

        // رسالة موجزة fallback إن لم توجد note
        const fallbackMsg: string =
          (first?.raw && ((first.raw as any).message || (first.raw as any).desc || (first.raw as any).raw || (first.raw as any).text)) ||
          'sync';

        // ===================== تحديث حقول الطلب =====================
        const extStatus = this.normalizeExternalStatus(statusRaw || 'processing');

        order.externalStatus = extStatus;
        order.lastSyncAt = new Date();

        const msgToStore = String((note ?? fallbackMsg) || '').slice(0, 250);
        order.lastMessage = msgToStore;

        // خزّن PIN إن توفّر
        if (pin) {
          order.pinCode = pin;
        }

        // أضف سجلًا في notes بصيغة { by:'system', text, at }
        try {
          const nowIso = new Date().toISOString();
          const arr = Array.isArray(order.notes) ? order.notes : [];
          if (note && note.trim()) {
            arr.push({ by: 'system', text: note, at: nowIso });
          } else if (fallbackMsg && fallbackMsg !== 'sync') {
            // نسجّل fallbackMsg كمعلومة نظام عند وجود نص مفيد
            arr.push({ by: 'system', text: fallbackMsg, at: nowIso });
          }
          order.notes = arr;
        } catch {
          // في حال أي خلل غير متوقع، لا نوقف التدفق
        }

        // إن كانت الحالة نهائية، احتسب زمن الإتمام ثم خزّن
        const isTerminal = extStatus === 'done' || extStatus === 'failed';
        if (isTerminal) {
          order.completedAt = new Date();
          order.durationMs = order.sentAt ? order.completedAt.getTime() - order.sentAt.getTime() : 0;

          // خزّن الحقول (lastMessage/notes/pinCode/…)
          await this.orderRepo.save(order);

          // حدّث الحالة الداخلية وفق المطلوب: 2→approved, 3→rejected
          if (extStatus === 'done') {
            await this.productsService.updateOrderStatus(order.id, 'approved');
          } else {
            await this.productsService.updateOrderStatus(order.id, 'rejected');
          }
        } else {
          // غير نهائي — خزّن التحديثات فقط
          await this.orderRepo.save(order);
        }

        // لوج المتابعة
        await this.logRepo.save(
          this.logRepo.create({
            order,
            action: 'refresh',
            result: extStatus === 'failed' ? 'fail' : 'success',
            message: msgToStore,
            payloadSnapshot: { response: res, extracted: { note, pin, statusRaw } },
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
    if (['success', 'completed', 'complete', 'ok', 'done', '2'].includes(s)) return 'done';
    // رفض/فشل نهائي
    if (['fail', 'failed', 'error', 'rejected', 'cancelled', 'canceled', '3'].includes(s)) return 'failed';
    // أرسل/مصفوف
    if (['sent', 'queued', 'queue', 'accepted'].includes(s)) return 'sent';
    // قيد التنفيذ/انتظار
    if (['processing', 'inprogress', 'running', 'pending', '1'].includes(s)) return 'processing';
    return 'processing';
  }
}
