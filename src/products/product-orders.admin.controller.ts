// src/products/product-orders.admin.controller.ts
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
  Query,
  Header,
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
import { ListOrdersDto } from './dto/list-orders.dto';

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

  /** تحويل Decimals/strings إلى number */
  private num(v: any): number | undefined {
    if (v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  /** تفطيح كائن الطلب لشكل يناسب الواجهة */
  private toClient(o: ProductOrder) {
    // TRY المجمّدة عند الاعتماد أولًا، ثم بدائل بسيطة
    const sellTRY =
      this.num((o as any).sellTryAtApproval) ??
      (o.sellPriceCurrency === 'TRY'
        ? this.num((o as any).sellPriceAmount ?? (o as any).price)
        : undefined);

    const costTRY =
      this.num((o as any).costTryAtApproval) ??
      (o.costCurrency === 'TRY' ? this.num((o as any).costAmount) : undefined);

    const profitTRY =
      this.num((o as any).profitTryAtApproval) ??
      (sellTRY != null && costTRY != null
        ? Number((sellTRY - costTRY).toFixed(2))
        : undefined);

    const currencyTRY =
      sellTRY != null || costTRY != null || profitTRY != null ? 'TRY' : undefined;

    return {
      id: o.id,
      orderNo: (o as any).orderNo ?? null,
      status: o.status,
      userIdentifier: (o as any).userIdentifier ?? null,

      // مستخدم مسطّح
      username:
        ((o as any).user && ((o as any).user.username || (o as any).user.fullName)) || undefined,
      userEmail: ((o as any).user && (o as any).user.email) || undefined,

      // المنتج والباقة (لللوغو والاسم)
      product: o.product
        ? {
            id: (o.product as any).id,
            name: (o.product as any).name,
            imageUrl:
              (o.product as any).imageUrl ||
              (o.product as any).image ||
              (o.product as any).logoUrl ||
              (o.product as any).iconUrl ||
              null,
          }
        : undefined,
      package: o.package
        ? {
            id: (o.package as any).id,
            name: (o.package as any).name,
            imageUrl:
              (o.package as any).imageUrl ||
              (o.package as any).image ||
              (o.package as any).logoUrl ||
              (o.package as any).iconUrl ||
              null,
            productId: (o.product as any)?.id ?? null,
          }
        : undefined,

      // ربط خارجي
      providerId: (o as any).providerId ?? null,
      providerName: null as string | null, // تُقرأ من /admin/integrations في الواجهة
      externalOrderId: (o as any).externalOrderId ?? null,

      // أزمنة
      createdAt: o.createdAt,
      sentAt: (o as any).sentAt ?? null,
      completedAt: (o as any).completedAt ?? null,
      durationMs: (o as any).durationMs ?? null,

      // التجميد/الموافقة
      fxLocked: (o as any).fxLocked ?? false,
      approvedLocalDate: (o as any).approvedLocalDate ?? undefined,

      // القيم الأصلية (لمن يلزم)
      sellPriceAmount: this.num((o as any).sellPriceAmount ?? (o as any).price),
      sellPriceCurrency: (o as any).sellPriceCurrency ?? 'USD',
      costAmount: this.num((o as any).costAmount),
      costCurrency: (o as any).costCurrency ?? 'USD',
      price: this.num((o as any).price),

      // قيم العرض المطلوبة للجدول
      sellTRY,
      costTRY,
      profitTRY,
      currencyTRY,
    };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query() query: ListOrdersDto) {
    // تُرجع items فيها sellTRY/costTRY/profitTRY + pageInfo
    return this.productsService.listOrdersForAdmin(query);
  }



  @Get('all')
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
      (order as any).externalStatus = 'not_sent';
      (order as any).sentAt = null;
      (order as any).lastSyncAt = null;
      (order as any).completedAt = null;
      (order as any).durationMs = null;
      if (note) (order as any).manualNote = note.slice(0, 500);
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
        if ((order as any).externalOrderId) {
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
          (order as any).manualNote = note.slice(0, 500);
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
          (order as any).manualNote = note.slice(0, 500);
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

    if ((order as any).externalOrderId) {
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
    if (!(order as any).providerId || !(order as any).externalOrderId) {
      throw new BadRequestException('الطلب غير مرسل خارجيًا');
    }

    // إيقاف مبكّر
    if (
      (order as any).externalStatus === 'done' ||
      (order as any).externalStatus === 'failed' ||
      order.status === 'approved' ||
      order.status === 'rejected'
    ) {
      return { message: 'الطلب منتهٍ بالفعل، لا حاجة للفحص', order };
    }

    try {
      const res = await this.integrations.checkOrders(
        (order as any).providerId,
        [(order as any).externalOrderId],
      );
      const first = Array.isArray(res) ? res[0] : res;

      let statusRaw: string | undefined = (first as any)?.mappedStatus;
      if (!statusRaw) {
        const code = String((first as any)?.providerStatus ?? '').trim();
        if (code === '1') statusRaw = 'pending';
        else if (code === '2') statusRaw = 'success';
        else if (code === '3') statusRaw = 'failed';
      }
      statusRaw =
        statusRaw ??
        (first as any)?.status ??
        (first as any)?.state ??
        (first as any)?.orderStatus ??
        (first as any)?.providerStatus ??
        'processing';

      const message: string =
        ((first as any)?.raw &&
          (((first as any).raw.message as any) ||
            (first as any).raw.desc ||
            (first as any).raw.raw)) ||
        'sent';

      const extStatus = this.normalizeExternalStatus(statusRaw || 'processing');

      (order as any).externalStatus = extStatus;
      (order as any).lastSyncAt = new Date();
      (order as any).lastMessage = String(message || '').slice(0, 250) || null;

      const isTerminal = extStatus === 'done' || extStatus === 'failed';
      if (isTerminal) {
        (order as any).completedAt = new Date();
        (order as any).durationMs = (order as any).sentAt
          ? (order as any).completedAt.getTime() -
            (order as any).sentAt.getTime()
          : 0;
      }

      await this.orderRepo.save(order);

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

    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    if (note) {
      (order as any).manualNote = note.slice(0, 500);
      await this.orderRepo.save(order);
    }

    const updated = await this.productsService.updateOrderStatus(id, status);
    if (!updated) throw new NotFoundException('تعذّر تحديث حالة الطلب');

    const terminalExternal = status === 'approved' ? 'done' : ('failed' as const);

    const completedAt = new Date();
    const durationMs = (updated as any).sentAt
      ? completedAt.getTime() - new Date((updated as any).sentAt).getTime()
      : (updated as any).durationMs ?? 0;

    await this.orderRepo.update(
      { id: (updated as any).id },
      {
        externalStatus: terminalExternal,
        completedAt,
        durationMs,
        lastSyncAt: new Date(),
        lastMessage: status === 'approved' ? 'Manual approval' : 'Manual rejection',
      } as any,
    );

    await this.logRepo.save(
      this.logRepo.create({
        order: { id: (updated as any).id } as any,
        action: 'dispatch',
        result: status === 'approved' ? 'success' : 'fail',
        message: `Manual ${status}`,
        payloadSnapshot: { manual: true },
      }),
    );

    const finalOrder = await this.orderRepo.findOne({ where: { id: (updated as any).id } });
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
    const order =
      (orderInput as any)?.package && (orderInput as any)?.user
        ? orderInput
        : await this.orderRepo.findOne({
            where: { id: orderInput.id },
            relations: ['package', 'user'],
          });

    if (!order) throw new NotFoundException('الطلب غير موجود (relations)');
    if (!(order as any).package) throw new BadRequestException('لا توجد باقة مرتبطة بالطلب');
    if (!(order as any).user) throw new BadRequestException('لا يوجد مستخدم مرتبط بالطلب');

    let chosenProviderId = providerId ?? null;
    if (!chosenProviderId) {
      const routing = await this.routingRepo.findOne({
        where: { package: { id: (order as any).package.id } as any },
        relations: ['package'],
      });
      if (!routing || routing.mode === 'manual' || !routing.primaryProviderId) {
        throw new BadRequestException('هذه الباقة مُعينة على Manual أو لا يوجد مزوّد أساسي');
      }
      chosenProviderId = routing.primaryProviderId;
    }

    const mapping = await this.mappingRepo.findOne({
      where: {
        our_package_id: (order as any).package.id as any,
        provider_api_id: chosenProviderId as any,
      },
    });
    if (!mapping) {
      throw new BadRequestException('لا يوجد ربط لهذه الباقة عند هذا المزوّد');
    }

    const costRow = await this.costRepo.findOne({
      where: { package: { id: (order as any).package.id } as any, providerId: chosenProviderId as any },
      relations: ['package'],
    });

    const costCurrency = (costRow as any)?.costCurrency ?? 'USD';
    const basePrice = Number(((order as any).package as any)?.basePrice ?? 0);
    const costAmount =
      Number((costRow as any)?.costAmount ?? 0) > 0 ? Number((costRow as any).costAmount) : basePrice;

    const musteriTel =
      ((order as any).user as any)?.phoneNumber &&
      String(((order as any).user as any).phoneNumber).trim().length > 0
        ? String(((order as any).user as any).phoneNumber).trim()
        : '111111111';

    let oyun: string | undefined;
    let kupur: string | undefined;

    const providerProducts = await this.integrations.syncProducts(chosenProviderId!);
    const matched = providerProducts.find(
      (p: any) => String(p.externalId) === String((mapping as any).provider_package_id),
    );
    if (matched?.meta) {
      oyun = matched.meta.oyun ?? matched.meta.oyun_bilgi_id ?? undefined;
      kupur = matched.meta.kupur ?? undefined;
    }

    const payload = {
      productId: String((mapping as any).provider_package_id),
      qty: Number((order as any).quantity ?? 1),
      params: {
        oyuncu_bilgi: (order as any).userIdentifier ?? undefined,
        musteri_tel: musteriTel,
        oyun,
        kupur,
      },
      clientOrderUuid: order.id,
    };

    this.logger.debug(
      `dispatch -> provider=${chosenProviderId} pkgMap=${(mapping as any).provider_package_id} oyun=${oyun} kupur=${kupur} user=${(order as any).userIdentifier}`,
    );

    const res = await this.integrations.placeOrder(chosenProviderId!, payload);

    const externalOrderId = (res as any)?.externalOrderId ?? null;
    const statusRaw: string =
      (res as any)?.providerStatus ?? ((res as any)?.mappedStatus as any) ?? 'sent';

    const message: string =
      ((res as any)?.raw &&
        (((res as any).raw.message as any) || (res as any).raw.desc || (res as any).raw.raw)) ||
      'sent';
    const extStatus = this.normalizeExternalStatus(statusRaw || 'processing');

    let finalCostAmount = costAmount;
    let finalCostCurrency = costCurrency;

    if (res && typeof (res as any).price === 'number') {
      finalCostAmount = Number((res as any).price);
      finalCostCurrency = ((res as any).costCurrency as string) || finalCostCurrency;
    }

    (order as any).providerId = chosenProviderId!;
    (order as any).externalOrderId = externalOrderId;
    (order as any).externalStatus = extStatus;
    (order as any).sentAt = new Date();
    (order as any).lastSyncAt = new Date();
    (order as any).lastMessage = String(message ?? '').slice(0, 250);
    (order as any).attempts = ((order as any).attempts ?? 0) + 1;

    (order as any).costCurrency = finalCostCurrency;
    (order as any).costAmount = Number(finalCostAmount.toFixed(2));

    const sell = Number((order as any).sellPriceAmount ?? (order as any).price ?? 0);
    (order as any).profitAmount = Number((sell - (order as any).costAmount).toFixed(2));

    if (note) (order as any).manualNote = note.slice(0, 500);

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
