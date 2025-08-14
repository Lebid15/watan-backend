import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  NotFoundException,
  UseGuards,
  Post,
  BadRequestException,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../auth/user-role.enum';

import { ProductsService, OrderStatus } from './products.service';
import { ProductOrder } from './product-order.entity';
import { OrderDispatchLog } from './order-dispatch-log.entity';
import { PackageRouting } from '../integrations/package-routing.entity';
import { PackageCost } from '../integrations/package-cost.entity';
import { PackageMapping } from '../integrations/package-mapping.entity';
import { IntegrationsService } from '../integrations/integrations.service';

type ExternalStatus =
  | 'not_sent'
  | 'queued'
  | 'sent'
  | 'processing'
  | 'done'
  | 'failed';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/orders')
export class ProductOrdersAdminController {
  private readonly logger = new Logger(ProductOrdersAdminController.name);

  constructor(
    private readonly productsService: ProductsService,
    private readonly integrations: IntegrationsService,

    @InjectRepository(ProductOrder)
    private readonly orderRepo: Repository<ProductOrder>,

    @InjectRepository(OrderDispatchLog)
    private readonly logRepo: Repository<OrderDispatchLog>,

    @InjectRepository(PackageRouting)
    private readonly routingRepo: Repository<PackageRouting>,

    @InjectRepository(PackageCost)
    private readonly costRepo: Repository<PackageCost>,

    @InjectRepository(PackageMapping)
    private readonly mappingRepo: Repository<PackageMapping>,
  ) {}

  /** 🔹 جلب كل الطلبات */
  @Get()
  async getAllOrders() {
    return this.productsService.getAllOrders();
  }

  /** 🔹 تحويل الطلبات المحددة إلى Manual */
  @Post('bulk/manual')
  async setManual(@Body() body: { ids: string[]; note?: string }) {
    const { ids, note } = body || {};
    if (!ids?.length) throw new BadRequestException('ids is required');

    const orders = await this.orderRepo.findBy({ id: In(ids) as any });
    for (const order of orders) {
      order.providerId = null;
      order.externalOrderId = null;
      order.externalStatus = 'not_sent';
      order.sentAt = null;
      order.lastSyncAt = null;
      order.completedAt = null;
      order.durationMs = null;
      if (note) order.manualNote = note.slice(0, 500);
      await this.orderRepo.save(order);

      await this.logRepo.save(
        this.logRepo.create({
          order,
          action: 'dispatch',
          result: 'success',
          message: 'Set to Manual',
          payloadSnapshot: { manualize: true, note },
        }),
      );
    }
    return { updated: orders.length };
  }

  /** 🔹 إرسال جماعي */
  @Post('bulk/dispatch')
  async bulkDispatch(
    @Body()
    body: {
      ids: string[];
      providerId?: string;
      note?: string;
    },
  ) {
    const { ids, providerId, note } = body || {};
    if (!ids?.length) throw new BadRequestException('ids is required');

    const orders = await this.orderRepo.findBy({ id: In(ids) as any });
    this.logger.debug(`bulk/dispatch: got ${orders.length} orders`);

    const results: Array<{ id: string; ok: boolean; message?: string }> = [];

    for (const order of orders) {
      try {
        if (order.externalOrderId) {
          results.push({ id: order.id, ok: false, message: 'already sent' });
          continue;
        }
        await this.performDispatch(order, providerId, note);
        results.push({ id: order.id, ok: true });
      } catch (e: any) {
        const msg = String(e?.message ?? 'fail');
        this.logger.warn(`bulk/dispatch fail for ${order.id}: ${msg}`);
        results.push({ id: order.id, ok: false, message: msg });
      }
    }

    return {
      message: 'bulk dispatch finished',
      total: ids.length,
      success: results.filter((r) => r.ok).length,
      fail: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /** 🔹 موافقة جماعية */
  @Post('bulk/approve')
  async bulkApprove(@Body() body: { ids: string[]; note?: string }) {
    const { ids, note } = body || {};
    if (!ids?.length) throw new BadRequestException('ids is required');

    const orders = await this.orderRepo.findBy({ id: In(ids) as any });
    let ok = 0,
      fail = 0;

    for (const order of orders) {
      try {
        if (note) {
          order.manualNote = note.slice(0, 500);
          await this.orderRepo.save(order);
        }
        await this.productsService.updateOrderStatus(order.id, 'approved');
        await this.logRepo.save(
          this.logRepo.create({
            order,
            action: 'dispatch',
            result: 'success',
            message: 'Manual approved (bulk)',
            payloadSnapshot: { manual: true, bulk: true },
          }),
        );
        ok++;
      } catch {
        fail++;
      }
    }
    return { message: 'bulk approve finished', total: ids.length, success: ok, fail };
  }

  /** 🔹 رفض جماعي */
  @Post('bulk/reject')
  async bulkReject(@Body() body: { ids: string[]; note?: string }) {
    const { ids, note } = body || {};
    if (!ids?.length) throw new BadRequestException('ids is required');

    const orders = await this.orderRepo.findBy({ id: In(ids) as any });
    let ok = 0,
      fail = 0;

    for (const order of orders) {
      try {
        if (note) {
          order.manualNote = note.slice(0, 500);
          await this.orderRepo.save(order);
        }
        await this.productsService.updateOrderStatus(order.id, 'rejected');
        await this.logRepo.save(
          this.logRepo.create({
            order,
            action: 'dispatch',
            result: 'fail',
            message: 'Manual rejected (bulk)',
            payloadSnapshot: { manual: true, bulk: true },
          }),
        );
        ok++;
      } catch {
        fail++;
      }
    }
    return { message: 'bulk reject finished', total: ids.length, success: ok, fail };
  }

  /** 🔹 إرسال فردي */
  @Post(':id/dispatch')
  async dispatchOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { providerId?: string; note?: string },
  ) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    if (order.externalOrderId) {
      throw new BadRequestException('الطلب تم إرساله مسبقًا');
    }

    const result = await this.performDispatch(order, body.providerId, body.note);
    return { message: 'تم إرسال الطلب للموفّر', order: result };
  }

  /** 🔹 تحديث حالة الطلب من المزوّد */
  @Post(':id/refresh')
  async refreshOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (!order.providerId || !order.externalOrderId) {
      throw new BadRequestException('الطلب غير مرسل خارجيًا');
    }

    // ✅ إيقاف مبكّر: لا تفحص طلبات منتهية
    if (
      order.externalStatus === 'done' ||
      order.externalStatus === 'failed' ||
      order.status === 'approved' ||
      order.status === 'rejected'
    ) {
      return { message: 'الطلب منتهٍ بالفعل، لا حاجة للفحص', order };
    }

    try {
      const res = await this.integrations.checkOrders(order.providerId, [order.externalOrderId]);
      const first = Array.isArray(res) ? res[0] : res;

      // ✅ أولوية للماب الجاهز من الدرايفر (success|pending|failed)
      let statusRaw: string | undefined = first?.mappedStatus;

      // ✅ Fallback: لو providerStatus جاء كود رقمي 1/2/3 (وفق جدولك)
      if (!statusRaw) {
        const code = String(first?.providerStatus ?? '').trim();
        if (code === '1') statusRaw = 'pending'; // انتظار
        else if (code === '2') statusRaw = 'success'; // قبول
        else if (code === '3') statusRaw = 'failed'; // رفض
      }

      // ✅ آخر fallback لبقية الحقول المحتملة
      statusRaw =
        statusRaw ??
        (first as any)?.status ??
        (first as any)?.state ??
        (first as any)?.orderStatus ??
        (first as any)?.providerStatus ??
        'processing';

      const message: string =
        (first?.raw && (first.raw.message || first.raw.desc || first.raw.raw)) || 'sent';

      // ملاحظة: إن لم تكن قد عدّلت توقيع الدالة لتقبل undefined،
      // استعمل || 'processing' لتطمين TypeScript.
      const extStatus = this.normalizeExternalStatus(statusRaw || 'processing');

      order.externalStatus = extStatus;
      order.lastSyncAt = new Date();
      order.lastMessage = String(message || '').slice(0, 250) || null;

      const isTerminal = extStatus === 'done' || extStatus === 'failed';
      if (isTerminal) {
        order.completedAt = new Date();
        order.durationMs = order.sentAt ? order.completedAt.getTime() - order.sentAt.getTime() : 0;
      }

      await this.orderRepo.save(order);

      // ربط الحالة الداخلية بالحالة الخارجية النهائية
      if (extStatus === 'done') {
        await this.productsService.updateOrderStatus(order.id, 'approved');
      } else if (extStatus === 'failed') {
        await this.productsService.updateOrderStatus(order.id, 'rejected');
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

      return { message: 'تم تحديث حالة الطلب', order };
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

      throw new BadRequestException(msg);
    }
  }

  /** 🔹 تعديل حالة الطلب يدويًا */
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status: OrderStatus; note?: string },
  ) {
    const { status, note } = body;
    if (!['approved', 'rejected'].includes(status)) {
      throw new NotFoundException('الحالة غير صحيحة');
    }

    // نجلب الطلب (سنحتاج حقول التتبّع)
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    // حفظ الملاحظة اليدوية (إن وجدت)
    if (note) {
      order.manualNote = note.slice(0, 500);
      await this.orderRepo.save(order);
    }

    // ✅ حدّث الحالة الداخلية (يتكفّل بالاسترجاع عند الرفض)
    const updated = await this.productsService.updateOrderStatus(id, status);
    if (!updated) throw new NotFoundException('تعذّر تحديث حالة الطلب');

    // ✅ اختم خارجيًا أيضاً لإيقاف أي polling/فحص تلقائي
    // approved  -> externalStatus = 'done'
    // rejected  -> externalStatus = 'failed'
    const terminalExternal = status === 'approved' ? 'done' : 'failed' as const;

    // احسب زمن التنفيذ إن لم يكن محسوبًا
    const completedAt = new Date();
    const durationMs = updated.sentAt
      ? completedAt.getTime() - new Date(updated.sentAt).getTime()
      : (updated.durationMs ?? 0);

    await this.orderRepo.update(
      { id: updated.id },
      {
        externalStatus: terminalExternal,
        completedAt,
        durationMs,
        lastSyncAt: new Date(),
        lastMessage: status === 'approved' ? 'Manual approval' : 'Manual rejection',
      },
    );

    // لوج
    await this.logRepo.save(
      this.logRepo.create({
        order: { id: updated.id } as any,
        action: 'dispatch',
        result: status === 'approved' ? 'success' : 'fail',
        message: `Manual ${status}`,
        payloadSnapshot: { manual: true },
      }),
    );

    // أعدّ التحميل بعد التحديث الخارجي لإرجاع الحالة النهائية
    const finalOrder = await this.orderRepo.findOne({ where: { id: updated.id } });

    return { message: 'تم تحديث حالة الطلب بنجاح', order: finalOrder };
  }

  /** 🔹 جلب السجلات */
  @Get(':id/logs')
  async getLogs(@Param('id', new ParseUUIDPipe()) id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const logs = await this.logRepo.find({
      where: { order: { id } as any },
      order: { createdAt: 'DESC' as any },
      take: 50,
    });

    return { orderId: id, logs };
  }

  /** 🔸 توحيد حالات المزوّد */
  private normalizeExternalStatus(raw?: string): ExternalStatus {
    const s = (raw || '').toString().toLowerCase();
    if (['success', 'completed', 'complete', 'ok', 'done'].includes(s)) return 'done';
    if (['fail', 'failed', 'error', 'rejected', 'cancelled', 'canceled'].includes(s)) return 'failed';
    if (['accepted'].includes(s)) return 'sent';
    if (['sent', 'queued', 'queue'].includes(s)) return 'sent';
    if (['processing', 'inprogress', 'running', 'pending'].includes(s)) return 'processing';
    return 'processing';
  }

  /** ♻️ تنفيذ الإرسال */
  private async performDispatch(
    orderInput: ProductOrder,
    providerId?: string | null,
    note?: string,
  ) {
    // ✅ تأكيد العلاقات اللازمة قبل أي استخدام
    const order =
      orderInput?.package && orderInput?.user
        ? orderInput
        : await this.orderRepo.findOne({
            where: { id: orderInput.id },
            relations: ['package', 'user'],
          });

    if (!order) throw new NotFoundException('الطلب غير موجود (relations)');
    if (!order.package) throw new BadRequestException('لا توجد باقة مرتبطة بالطلب');
    if (!order.user) throw new BadRequestException('لا يوجد مستخدم مرتبط بالطلب');

    let chosenProviderId = providerId ?? null;
    if (!chosenProviderId) {
      const routing = await this.routingRepo.findOne({
        where: { package: { id: order.package.id } as any },
        relations: ['package'],
      });
      if (!routing || routing.mode === 'manual' || !routing.primaryProviderId) {
        throw new BadRequestException('هذه الباقة مُعينة على Manual أو لا يوجد مزوّد أساسي');
      }
      chosenProviderId = routing.primaryProviderId;
    }

    const mapping = await this.mappingRepo.findOne({
      where: {
        our_package_id: order.package.id as any,
        provider_api_id: chosenProviderId as any,
      },
    });
    if (!mapping) {
      throw new BadRequestException('لا يوجد ربط لهذه الباقة عند هذا المزوّد');
    }

    const costRow = await this.costRepo.findOne({
      where: { package: { id: order.package.id } as any, providerId: chosenProviderId as any },
      relations: ['package'],
    });

    const costCurrency = (costRow?.costCurrency as any) ?? 'USD';
    const basePrice = Number((order.package as any)?.basePrice ?? 0);
    const costAmount =
      Number(costRow?.costAmount ?? 0) > 0 ? Number(costRow!.costAmount) : basePrice;

    const musteriTel =
      (order.user as any)?.phoneNumber && String((order.user as any).phoneNumber).trim().length > 0
        ? String((order.user as any).phoneNumber).trim()
        : '111111111';

    let oyun: string | undefined;
    let kupur: string | undefined;

    // ⚠️ syncProducts قد تكون مكلفة؛ يمكن لاحقًا استبدالها بكاش مركزي
    const providerProducts = await this.integrations.syncProducts(chosenProviderId!);
    const matched = providerProducts.find(
      (p: any) => String(p.externalId) === String(mapping.provider_package_id),
    );
    if (matched?.meta) {
      oyun = matched.meta.oyun ?? matched.meta.oyun_bilgi_id ?? undefined;
      kupur = matched.meta.kupur ?? undefined;
    }

    const payload = {
      productId: String(mapping.provider_package_id),
      qty: Number(order.quantity ?? 1),
      params: {
        oyuncu_bilgi: order.userIdentifier ?? undefined,
        musteri_tel: musteriTel,
        oyun,
        kupur,
      },
      clientOrderUuid: order.id,
    };

    this.logger.debug(
      `dispatch -> provider=${chosenProviderId} pkgMap=${mapping.provider_package_id} oyun=${oyun} kupur=${kupur} user=${order.userIdentifier}`,
    );

    const res = await this.integrations.placeOrder(chosenProviderId!, payload);

    const externalOrderId = (res as any)?.externalOrderId ?? null;
    const statusRaw: string =
      (res as any)?.providerStatus ??
      ((res as any)?.mappedStatus as any) ??
      'sent';

    const message: string =
      ((res as any)?.raw && ((res as any).raw.message || (res as any).raw.desc || (res as any).raw.raw)) ||
      'sent';
    const extStatus = this.normalizeExternalStatus(statusRaw || 'processing');
    let finalCostAmount = costAmount;           // من PackageCost/basePrice كـ fallback
    let finalCostCurrency = costCurrency;       // من PackageCost كـ fallback

    if (res && typeof (res as any).price === 'number') {
      finalCostAmount   = Number((res as any).price);
      finalCostCurrency = ((res as any).costCurrency as string) || finalCostCurrency;
    }
    order.providerId = chosenProviderId!;
    order.externalOrderId = externalOrderId;
    order.externalStatus = extStatus;
    order.sentAt = new Date();
    order.lastSyncAt = new Date();
    order.lastMessage = String(message ?? '').slice(0, 250);
    order.attempts = (order.attempts ?? 0) + 1;

    // احفظ التكلفة + العملة
    order.costCurrency = finalCostCurrency;
    order.costAmount   = Number(finalCostAmount.toFixed(2));

    // الربح = بيع - تكلفة
    const sell = Number(order.sellPriceAmount ?? order.price ?? 0);
    order.profitAmount = Number((sell - order.costAmount).toFixed(2));

    if (note) order.manualNote = note.slice(0, 500);

    await this.orderRepo.save(order);

    await this.logRepo.save(
      this.logRepo.create({
        order,
        action: 'dispatch',
        result: 'success',
        message,
        payloadSnapshot: { providerId: chosenProviderId, payload, response: res },
      }),
    );

    return order;
  }
}
