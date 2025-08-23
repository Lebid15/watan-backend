// src/products/products.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';
import { User } from '../user/user.entity';
import { ProductOrder } from './product-order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Currency } from '../currencies/currency.entity';
import { OrderDispatchLog } from './order-dispatch-log.entity';
import { PackageRouting } from '../integrations/package-routing.entity';
import { PackageMapping } from '../integrations/package-mapping.entity';
import { IntegrationsService } from '../integrations/integrations.service';
import { AccountingPeriodsService } from '../accounting/accounting-periods.service';
import { decodeCursor, encodeCursor, toEpochMs } from '../utils/pagination';
import { ListOrdersDto } from './dto/list-orders.dto';
import { CodeItem } from '../codes/entities/code-item.entity';


type OrderView = {
  id: string;
  status: string;
  quantity: number;
  priceUSD: number;
  unitPriceUSD: number;
  display: {
    currencyCode: string;
    unitPrice: number;
    totalPrice: number;
  };
  product: { id: string; name: string };
  package: { id: string; name: string };
  userIdentifier: string | null;
  extraField: string | null;
  createdAt: Date;
};

export type OrderStatus = 'pending' | 'approved' | 'rejected';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)            private productsRepo: Repository<Product>,
    @InjectRepository(ProductPackage)     private packagesRepo: Repository<ProductPackage>,
    @InjectRepository(PackagePrice)       private packagePriceRepo: Repository<PackagePrice>,
    @InjectRepository(PriceGroup)         private priceGroupsRepo: Repository<PriceGroup>,
    @InjectRepository(User)               private usersRepo: Repository<User>,
    @InjectRepository(ProductOrder)       private ordersRepo: Repository<ProductOrder>,
    @InjectRepository(Currency)           private currenciesRepo: Repository<Currency>,
    @InjectRepository(OrderDispatchLog)   private readonly logsRepo: Repository<OrderDispatchLog>,
    @InjectRepository(PackageRouting)     private readonly routingRepo: Repository<PackageRouting>,
    @InjectRepository(PackageMapping)     private readonly mappingRepo: Repository<PackageMapping>,
    private readonly integrations: IntegrationsService,
    private readonly notifications: NotificationsService,
    private readonly accounting: AccountingPeriodsService,
  ) {}

  // ---------- Helpers خاصة بالـ tenant ----------
  private ensureSameTenant(entityTenantId?: string | null, expectedTenantId?: string) {
    if (!expectedTenantId) return; // لا تحقق إن لم يُطلب تقييد
    if (!entityTenantId) throw new ForbiddenException('هذا السجل غير مرتبط بأي مستأجر');
    if (entityTenantId !== expectedTenantId) throw new ForbiddenException('لا تملك صلاحية على هذا المستأجر');
  }

  private addTenantWhere(qb: any, alias: string, tenantId?: string) {
    if (tenantId) qb.andWhere(`${alias}."tenantId" = :tid`, { tid: tenantId });
  }

  // ===== Helper: تطبيع حالة المزود إلى done/failed/processing/sent مع دعم 1/2/3 =====
  private normalizeExternalStatus(raw?: string): 'done' | 'failed' | 'processing' | 'sent' {
    const s = (raw || '').toString().toLowerCase().trim();
    if (['2', 'success', 'ok', 'done', 'completed', 'complete'].includes(s)) return 'done';
    if (['3', 'failed', 'fail', 'error', 'rejected', 'cancelled', 'canceled'].includes(s)) return 'failed';
    if (['accepted', 'sent', 'queued', 'queue'].includes(s)) return 'sent';
    return 'processing';
  }

  // ===== ✅ المزامنة اليدوية مع المزود + التقاط note/pin (مقيّدة بالـ tenant إن مرّ) =====
  async syncExternal(orderId: string, tenantId?: string): Promise<{
    order: ProductOrder;
    extStatus: 'done' | 'failed' | 'processing' | 'sent';
    note?: string;
    pin?: string;
  }> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId } as any,
      relations: ['user', 'package', 'product'],
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    this.ensureSameTenant((order as any).user?.tenantId, tenantId);

    if (!order.providerId || !order.externalOrderId) {
      throw new BadRequestException('الطلب غير مرسل خارجيًا');
    }

    // ✅ استنتج tenantId فعّال
    const effectiveTenantId = String(tenantId ?? (order as any)?.user?.tenantId);
    // إن أردت التشديد:
    // if (!effectiveTenantId) throw new BadRequestException('tenantId is required');

    const alreadyTerminal =
      order.externalStatus === 'done' ||
      order.externalStatus === 'failed' ||
      order.status === 'approved' ||
      order.status === 'rejected';

    // ✅ مرّر tenantId حسب التوقيع الجديد
    const res = await this.integrations.checkOrders(
      order.providerId,
      effectiveTenantId,
      [order.externalOrderId],
    );
    const first: any = Array.isArray(res) ? res[0] : res;

    let statusRaw: string | undefined = first?.mappedStatus;
    if (!statusRaw) {
      const code = String(first?.providerStatus ?? '').trim();
      if (code === '1') statusRaw = 'pending';
      else if (code === '2') statusRaw = 'success';
      else if (code === '3') statusRaw = 'failed';
    }
    statusRaw =
      statusRaw ??
      first?.status ??
      first?.state ??
      first?.orderStatus ??
      first?.providerStatus ??
      'processing';

    const extStatus = this.normalizeExternalStatus(statusRaw);
    console.log('[SERVICE syncExternal] provider reply', {
      orderId: order.id,
      providerId: order.providerId,
      externalOrderId: order.externalOrderId,
      mapped: statusRaw,
      normalized: extStatus,
      note: first?.note || first?.raw?.message || first?.raw?.desc || null,
      pin: first?.pin || first?.raw?.pin || null,
    });

    const note: string | undefined =
      first?.note?.toString?.().trim?.() ||
      first?.raw?.desc?.toString?.().trim?.() ||
      first?.raw?.note?.toString?.().trim?.() ||
      first?.raw?.message?.toString?.().trim?.() ||
      first?.raw?.text?.toString?.().trim?.();

    const pin: string | undefined =
      first?.pin != null ? String(first.pin).trim()
        : first?.raw?.pin != null ? String(first.raw.pin).trim()
        : undefined;

    order.externalStatus = extStatus as any;
    order.lastSyncAt = new Date();
    order.lastMessage = String(note || first?.raw?.message || first?.raw?.desc || 'sync').slice(0, 250) || null;
    if (pin) order.pinCode = pin;

    const nowIso = new Date().toISOString();
    if (note && note.trim()) {
      const arr = Array.isArray(order.notes) ? order.notes : [];
      arr.push({ by: 'system', text: note, at: nowIso });
      order.notes = arr as any;
      (order as any).providerMessage = note;
      (order as any).notesCount = arr.length;
    }

    const isTerminal = extStatus === 'done' || extStatus === 'failed';

    if (isTerminal) {
      order.completedAt = new Date();
      order.durationMs = order.sentAt
        ? order.completedAt.getTime() - order.sentAt.getTime()
        : 0;
      await this.ordersRepo.save(order);

      if (extStatus === 'done') {
        await this.updateOrderStatus(order.id, 'approved', effectiveTenantId);
      } else {
        // ✅ قيد routing بالتينانت
        const routing = await this.routingRepo.findOne({
          where: { package: { id: order.package.id } as any, tenantId: effectiveTenantId } as any,
          relations: ['package'],
        });

        const isOnFallback =
          routing?.fallbackProviderId &&
          order.providerId === routing.fallbackProviderId;
        const hasFallback = !!routing?.fallbackProviderId;

        if (isOnFallback || !hasFallback) {
          await this.updateOrderStatus(order.id, 'rejected', effectiveTenantId);
        } else {
          // اتركه للمونيتور/إعادة المحاولة لاحقًا
        }
      }
    }

    await this.logsRepo.save(
      this.logsRepo.create({
        order,
        action: 'refresh',
        result: extStatus === 'failed' ? 'fail' : 'success',
        message: order.lastMessage || 'sync',
        payloadSnapshot: { response: res, extracted: { note, pin, statusRaw } },
      }),
    );

    return { order, extStatus, note, pin };
  }


  async updateImage(tenantId: string, id: string, imageUrl: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id, tenantId } as any });
    if (!product) throw new NotFoundException('Product not found');
    product.imageUrl = imageUrl;
    return this.productsRepo.save(product);
  }

  async findAllWithPackages(tenantId: string): Promise<any[]> {
    const products = await this.productsRepo.find({
      where: { tenantId } as any,
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
    });

    const allPriceGroups = await this.priceGroupsRepo.find({ where: { tenantId } as any });

    return products.map((product) => ({
      ...product,
      packages: (product.packages || []).map((pkg) => ({
        ...pkg,
        basePrice: pkg.basePrice ?? pkg.capital ?? 0,
        prices: allPriceGroups.map((group) => {
          const existingPrice = (pkg.prices || []).find(
            (price) => price.priceGroup?.id === group.id,
          );
          return {
            id: existingPrice?.id ?? null,
            groupId: group.id,
            groupName: group.name,
            price: existingPrice?.price ?? 0,
          };
        }),
      })),
    }));
  }

  async findOneWithPackages(tenantId: string, id: string): Promise<any> {
    const product = await this.productsRepo.findOne({
      where: { id, tenantId } as any,
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
    });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');

    const allPriceGroups = await this.priceGroupsRepo.find({ where: { tenantId } as any });

    return {
      ...product,
      packages: (product.packages || []).map((pkg) => ({
        ...pkg,
        basePrice: pkg.basePrice ?? pkg.capital ?? 0,
        prices: allPriceGroups.map((group) => {
          const existingPrice = (pkg.prices || []).find(
            (price) => price.priceGroup?.id === group.id,
          );
          return {
            id: existingPrice?.id ?? null,
            groupId: group.id,
            groupName: group.name,
            price: existingPrice?.price ?? 0,
          };
        }),
      })),
    };
  }

  async create(product: Product): Promise<Product> {
    return this.productsRepo.save(product);
  }

  async update(tenantId: string, id: string, body: Partial<Product>): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id, tenantId } as any });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');
    Object.assign(product, body);
    return this.productsRepo.save(product);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const product = await this.productsRepo.findOne({ where: { id, tenantId } as any });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');
    await this.productsRepo.remove(product);
  }

  async createPriceGroup(tenantId: string, data: Partial<PriceGroup>): Promise<PriceGroup> {
    if (!data.name || !data.name.trim()) throw new ConflictException('اسم المجموعة مطلوب');
    const name = data.name.trim();

    const exists = await this.priceGroupsRepo.findOne({ where: { name, tenantId } as any });
    if (exists) throw new ConflictException('هذه المجموعة موجودة مسبقًا');

    const created: PriceGroup = this.priceGroupsRepo.create({ ...data, name, tenantId } as Partial<PriceGroup>) as PriceGroup;
    const saved: PriceGroup = await this.priceGroupsRepo.save(created);
    return saved;
  }

  async deletePriceGroup(tenantId: string, id: string): Promise<void> {
    const row = await this.priceGroupsRepo.findOne({ where: { id, tenantId } as any });
    if (!row) throw new NotFoundException('لم يتم العثور على المجموعة');
    await this.priceGroupsRepo.remove(row);
  }

  async getUsersPriceGroups(tenantId: string): Promise<{ id: string; name: string; usersCount: number }[]> {
    const groups = await this.priceGroupsRepo.find({ where: { tenantId } as any });
    return Promise.all(
      groups.map(async (g) => {
        const usersCount = await this.usersRepo.count({ where: { tenantId, priceGroup: { id: g.id } } as any });
        return { id: g.id, name: g.name, usersCount };
      }),
    );
  }

  // =====================================
  // 🔹 مجموعات الأسعار
  // =====================================

  async getPriceGroups(tenantId: string): Promise<PriceGroup[]> {
    return this.priceGroupsRepo.find({ where: { tenantId } as any });
  }

  async addPackageToProduct(
    tenantId: string,
    productId: string,
    data: Partial<ProductPackage>,
  ): Promise<ProductPackage> {
    if (!data.name || !data.name.trim()) throw new ConflictException('اسم الباقة مطلوب');

    const product = await this.productsRepo.findOne({
      where: { id: productId, tenantId } as any,
      relations: ['packages'],
    });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');

    const initialCapital = Number(data.capital ?? data.basePrice ?? 0);

    const newPackage: ProductPackage = this.packagesRepo.create({
      tenantId,
      name: data.name.trim(),
      description: data.description ?? '',
      basePrice: initialCapital,
      capital: initialCapital,
      isActive: data.isActive ?? true,
      imageUrl: data.imageUrl,
      product,
    } as Partial<ProductPackage>) as ProductPackage;

    // ✅ ثبّت النوع هنا
    const saved: ProductPackage = await this.packagesRepo.save(newPackage as ProductPackage);

    // أنشئ مصفوفة الـ rows أولاً ثم create(array) مرة واحدة
    const priceGroups = await this.priceGroupsRepo.find({ where: { tenantId } as any });
    const rowsData = priceGroups.map((group) => ({
      tenantId,
      package: saved,
      priceGroup: group,
      price: initialCapital,
    })) as Partial<PackagePrice>[];

    const prices: PackagePrice[] = this.packagePriceRepo.create(rowsData) as PackagePrice[];
    await this.packagePriceRepo.save(prices);

    (saved as any).prices = prices;
    return saved as ProductPackage;
  }

  /** ✅ حذف باقة (مع أسعارها) */
  async deletePackage(tenantId: string, id: string): Promise<void> {
    const pkg = await this.packagesRepo.findOne({ where: { id, tenantId } as any, relations: ['prices'] });
    if (!pkg) throw new NotFoundException('لم يتم العثور على الباقة');

    if (Array.isArray(pkg.prices) && pkg.prices.length) await this.packagePriceRepo.remove(pkg.prices);
    await this.packagesRepo.remove(pkg);
  }

  /** ✅ تحديث رأس المال وأسعار الباقة لكل مجموعة */
  async updatePackagePrices(
    tenantId: string,
    packageId: string,
    data: { capital: number; prices: { groupId: string; price: number }[] },
  ) {
    const pkg = await this.packagesRepo.findOne({
      where: { id: packageId, tenantId } as any,
      relations: ['prices', 'prices.priceGroup'],
    });
    if (!pkg) throw new NotFoundException('لم يتم العثور على الباقة');

    pkg.capital = Number(data.capital || 0);
    pkg.basePrice = Number(data.capital || 0);
    await this.packagesRepo.save(pkg);

    for (const p of data.prices || []) {
      const group = await this.priceGroupsRepo.findOne({ where: { id: p.groupId, tenantId } as any });
      if (!group) continue;

      let priceEntity = (pkg.prices || []).find((pr) => pr.priceGroup?.id === p.groupId);

      if (!priceEntity) {
        const createdPrice: PackagePrice = this.packagePriceRepo.create({
          tenantId,
          package: pkg,
          priceGroup: group,
          price: Number(p.price || 0),
        } as Partial<PackagePrice>) as PackagePrice;
        priceEntity = createdPrice;
      } else {
        priceEntity.price = Number(p.price || 0);
      }

      await this.packagePriceRepo.save(priceEntity as PackagePrice);
    }

    return { message: 'تم تحديث أسعار الباقة ورأس المال بنجاح' };
  }

  /** ✅ جلب أسعار باقات متعددة */
  async getPackagesPricesBulk(
    tenantId: string,
    body: { packageIds: string[]; groupId?: string },
  ) {
    if (!Array.isArray(body.packageIds) || body.packageIds.length === 0) {
      throw new BadRequestException('packageIds مطلوب');
    }
    const ids = body.packageIds.slice(0, 1000);

    const rows = await this.packagePriceRepo.find({
      where: body.groupId
        ? ({ tenantId, package: { id: In(ids) }, priceGroup: { id: body.groupId } } as any)
        : ({ tenantId, package: { id: In(ids) } } as any),
      relations: ['package', 'priceGroup'],
    });

    return rows.map((p) => ({
      packageId: p.package.id,
      groupId: p.priceGroup.id,
      groupName: p.priceGroup.name,
      priceId: p.id,
      price: Number(p.price) || 0,
    }));
  }

  // ================== التسعير الأساس (بالدولار) ==================
  private async getEffectivePriceUSD(packageId: string, userId: string): Promise<number> {
    const [pkg, user] = await Promise.all([
      this.packagesRepo.findOne({ where: { id: packageId } as any, relations: ['prices', 'prices.priceGroup'] }),
      this.usersRepo.findOne({ where: { id: userId } as any, relations: ['priceGroup'] }),
    ]);

    if (!pkg) throw new NotFoundException('الباقة غير موجودة');
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    // 🔒 تأكد من تطابق المستأجر بين المستخدم والباقة
    this.ensureSameTenant((pkg as any).tenantId, (user as any).tenantId);

    const base = Number(pkg.basePrice ?? pkg.capital ?? 0);
    if (!user?.priceGroup) return base;

    const match = (pkg.prices ?? []).find(p => p.priceGroup?.id === user.priceGroup!.id);
    return match ? Number(match.price) : base;
  }

  /** تحويل mappedStatus القادم من الدرايفر إلى حالة خارجية داخلية موحّدة */
  private mapMappedToExternalStatus(mapped?: string) {
    const s = String(mapped || '').toLowerCase();
    if (['success','ok','done','completed','complete'].includes(s)) return 'done';
    if (['failed','fail','error','rejected','cancelled','canceled'].includes(s)) return 'failed';
    if (['sent','accepted','queued','queue'].includes(s)) return 'sent';
    return 'processing';
  }

  /** محاولة إرسال الطلب تلقائيًا حسب إعدادات التوجيه (مع تجربة fallback مرة واحدة إن لزم) */
  private async tryAutoDispatch(orderId: string, tenantId?: string) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId } as any,
      relations: ['package', 'product', 'user'],
    });
    if (!order) return;

    this.ensureSameTenant((order as any).user?.tenantId, tenantId);

    // ✅ tenantId الفعّال لهذا التنفيذ
    const effectiveTenantId = String(tenantId ?? (order as any)?.user?.tenantId);
    // إن أردت التشديد:
    // if (!effectiveTenantId) throw new BadRequestException('tenantId is required');

    if (order.providerId || order.externalOrderId || order.status !== 'pending') return;

    // قيّد الـ routing بالتينانت
    const routing = await this.routingRepo.findOne({
      where: { package: { id: order.package.id } as any, tenantId: effectiveTenantId } as any,
      relations: ['package'],
    });
    if (!routing || routing.mode !== 'auto') return;

    // 🟢 توجيه داخلي: قسم الأكواد
    if (routing.providerType === 'internal_codes' && routing.codeGroupId) {
      await this.ordersRepo.manager.transaction(async (trx) => {
        const itemRepo = trx.getRepository(CodeItem);
        const orderRepo = trx.getRepository(ProductOrder);
        const logRepo = trx.getRepository(OrderDispatchLog);

        // احجز أقدم كود متاح ضمن نفس التينانت والمجموعة
        const code = await itemRepo.findOne({
          where: { groupId: routing.codeGroupId as any, status: 'available', tenantId: effectiveTenantId } as any,
          order: { createdAt: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!code) {
          await logRepo.save(
            logRepo.create({
              order,
              action: 'dispatch',
              result: 'fail',
              message: 'لا يوجد أكواد متاحة لهذه المجموعة',
              payloadSnapshot: { providerType: 'internal_codes', codeGroupId: routing.codeGroupId },
            }),
          );
          return;
        }

        code.status = 'used';
        code.orderId = order.id;
        code.usedAt = new Date();
        await itemRepo.save(code);

        const codeText = `CODE: ${code.pin ?? ''}${code.serial ? (code.pin ? ' / ' : '') + code.serial : ''}`.trim();
        const nowIso = new Date().toISOString();

        order.status = 'approved';
        order.externalStatus = 'done' as any;
        order.lastMessage = codeText.slice(0, 250);
        order.notes = [
          ...(Array.isArray(order.notes) ? order.notes : []),
          { by: 'system', text: codeText, at: nowIso },
        ];
        order.completedAt = new Date();
        order.durationMs = order.sentAt ? order.completedAt.getTime() - order.sentAt.getTime() : (order.durationMs ?? 0);

        await orderRepo.save(order);

        await logRepo.save(
          logRepo.create({
            order,
            action: 'dispatch',
            result: 'success',
            message: order.lastMessage || 'code attached',
            payloadSnapshot: {
              providerType: 'internal_codes',
              codeId: code.id,
              code: { pin: code.pin, serial: code.serial },
            },
          }),
        );
      });

      return;
    }

    // 🔵 مزوّد خارجي
    if (!routing.primaryProviderId) return;

    const tryOnce = async (providerId: string) => {
      // احضر الـ mapping ضمن نفس التينانت
      const mapping = await this.mappingRepo.findOne({
        where: {
          our_package_id: order.package.id,
          provider_api_id: providerId,
          tenantId: effectiveTenantId,
        } as any,
      });
      if (!mapping) {
        throw new Error('لا يوجد ربط لهذه الباقة عند هذا المزوّد');
      }

      const payload = {
        productId: String(mapping.provider_package_id),
        qty: Number(order.quantity || 1),
        params: {
          ...(mapping.meta || {}),
          userIdentifier: order.userIdentifier || undefined,
          extraField: order.extraField || undefined,
        },
        clientOrderUuid: order.id,
      };

      // ✅ مرّر tenantId إلى خدمات التكامل
      const placed = await this.integrations.placeOrder(providerId, effectiveTenantId, payload);
      const cfg = await this.integrations.get(providerId, effectiveTenantId);

      let priceCurrency: string | undefined =
        (placed as any)?.costCurrency ||
        (placed as any)?.priceCurrency ||
        (placed as any)?.raw?.currency ||
        (placed as any)?.raw?.Currency;

      if (cfg.provider === 'znet') priceCurrency = 'TRY';

      if (typeof priceCurrency === 'string') {
        priceCurrency = priceCurrency.toUpperCase().trim();
      } else {
        priceCurrency = 'USD';
      }

      if (typeof (placed as any)?.price === 'number' && Number.isFinite((placed as any).price)) {
        order.costAmount = Math.abs(Number((placed as any).price)) as any;
        order.costCurrency = (priceCurrency as any) || 'USD';
      }

      order.providerId = providerId;
      order.externalOrderId = (placed as any)?.externalOrderId ?? null;
      order.externalStatus = this.mapMappedToExternalStatus((placed as any)?.mappedStatus) as any;
      order.sentAt = new Date();
      order.lastSyncAt = new Date();
      order.lastMessage = String(
        (placed as any)?.raw?.message ||
        (placed as any)?.raw?.desc ||
        (placed as any)?.providerStatus ||
        (placed as any)?.mappedStatus ||
        'sent'
      ).slice(0, 250);
      order.attempts = (order.attempts ?? 0) + 1;
      await this.ordersRepo.save(order);

      await this.logsRepo.save(
        this.logsRepo.create({
          order,
          action: 'dispatch',
          result: 'success',
          message: order.lastMessage || 'sent',
          payloadSnapshot: { providerId, payload, response: placed },
        }),
      );

      if (order.externalStatus === 'done') {
        await this.updateOrderStatus(order.id, 'approved', effectiveTenantId);
      } else if (order.externalStatus === 'failed') {
        throw new Error('primary dispatch failed (mapped as failed)');
      }
    };

    try {
      await tryOnce(routing.primaryProviderId!);
      return;
    } catch (err: any) {
      await this.logsRepo.save(
        this.logsRepo.create({
          order,
          action: 'dispatch',
          result: 'fail',
          message: String(err?.message || 'failed to dispatch').slice(0, 250),
        }),
      );
    }

    if (routing.fallbackProviderId) {
      try {
        await tryOnce(routing.fallbackProviderId);
        return;
      } catch (err2: any) {
        await this.logsRepo.save(
          this.logsRepo.create({
            order,
            action: 'dispatch',
            result: 'fail',
            message: String(err2?.message || 'failed to dispatch (fallback)').slice(0, 250),
          }),
        );
        order.externalStatus = 'failed' as any;
        order.completedAt = new Date();
        order.durationMs = order.sentAt ? order.completedAt.getTime() - order.sentAt.getTime() : 0;
        await this.ordersRepo.save(order);
        await this.updateOrderStatus(order.id, 'rejected', effectiveTenantId);
        return;
      }
    }

    // إذا فشل الأساسي ولم يوجد بديل
    order.externalStatus = 'failed' as any;
    order.completedAt = new Date();
    order.durationMs = order.sentAt ? order.completedAt.getTime() - order.sentAt.getTime() : 0;
    await this.ordersRepo.save(order);
    await this.updateOrderStatus(order.id, 'rejected', effectiveTenantId);
  }

  async createOrder(
    data: {
      productId: string;
      packageId: string;
      quantity: number;
      userId: string;
      userIdentifier?: string;
      extraField?: string;
    },
    tenantId?: string,
  ) {
    const { productId, packageId, quantity, userId, userIdentifier, extraField } = data;

    if (!quantity || quantity <= 0 || !Number.isFinite(Number(quantity))) {
      throw new BadRequestException('Quantity must be a positive number');
    }

    const created = await this.ordersRepo.manager.transaction(async (trx) => {
      const productsRepo = trx.getRepository(Product);
      const packagesRepo = trx.getRepository(ProductPackage);
      const usersRepo    = trx.getRepository(User);
      const ordersRepo   = trx.getRepository(ProductOrder);

      // جلب المستخدم + العملة
      const user = await usersRepo.findOne({ where: { id: userId } as any, relations: ['currency'] });
      if (!user) throw new NotFoundException('المستخدم غير موجود');

      // 🔐 تأكيد أن الطلب ينتمي لنفس المستأجر المتوقع (إن تم تمريره)
      this.ensureSameTenant((user as any).tenantId, tenantId);

      if (user.isActive === false) {
        throw new ConflictException('الحساب غير فعّال');
      }

      // جلب المنتج والباقة وتحقق المستأجر
      const [product, pkg] = await Promise.all([
        productsRepo.findOne({ where: { id: productId } as any }),
        packagesRepo.findOne({ where: { id: packageId } as any }),
      ]);
      if (!product) throw new NotFoundException('المنتج غير موجود');
      if (!pkg)     throw new NotFoundException('الباقة غير موجودة');

      // ✅ تأكد أن المنتج والباقة بنفس مستأجر المستخدم
      this.ensureSameTenant((product as any).tenantId, (user as any).tenantId);
      this.ensureSameTenant((pkg as any).tenantId,     (user as any).tenantId);

      // التسعير بالدولار (الدالة تتحقق من المستأجر داخليًا)
      const unitPriceUSD = await this.getEffectivePriceUSD(packageId, userId);
      const totalUSD     = Number(unitPriceUSD) * Number(quantity);

      const rate      = user.currency ? Number(user.currency.rate) : 1;
      const code      = user.currency ? user.currency.code : 'USD';
      const totalUser = totalUSD * rate;

      // خصم الرصيد + تحقق حد السالب
      const balance   = Number(user.balance) || 0;
      const overdraft = Number(user.overdraftLimit) || 0;
      if (totalUser > balance + overdraft) {
        throw new ConflictException('الرصيد غير كافٍ (تجاوز حد السالب المسموح)');
      }
      user.balance = balance - totalUser;
      await usersRepo.save(user);

      // إنشاء الطلب
      const order = ordersRepo.create({
        product,
        package: pkg,
        quantity,
        price: totalUSD,
        status: 'pending',
        user,
        userIdentifier: userIdentifier ?? null,
        extraField:     extraField ?? null,
      }) as ProductOrder;

      // 🧷 تضمين tenantId صراحةً على الكيان
      (order as any).tenantId = (user as any).tenantId;

      const saved = await ordersRepo.save<ProductOrder>(order);

      // عرض مختصر
      type OrderView = {
        id: string;
        status: 'pending' | 'approved' | 'rejected';
        quantity: number;
        priceUSD: number;
        unitPriceUSD: number;
        display: { currencyCode: string; unitPrice: number; totalPrice: number };
        product: { id: string; name: string | null };
        package: { id: string; name: string | null };
        userIdentifier: string | null;
        extraField: string | null;
        createdAt: Date;
      };

      return {
        entityId: saved.id,
        view: {
          id: saved.id,
          status: saved.status,
          quantity: saved.quantity,
          priceUSD: totalUSD,
          unitPriceUSD,
          display: {
            currencyCode: code,
            unitPrice: unitPriceUSD * rate,
            totalPrice: totalUser,
          },
          product: { id: product.id, name: product.name ?? null },
          package: { id: pkg.id, name: pkg.name ?? null },
          userIdentifier: saved.userIdentifier ?? null,
          extraField:     saved.extraField ?? null,
          createdAt: saved.createdAt,
        } satisfies OrderView,
      };
    });

    // محاولة إرسال تلقائي ضمن نفس المستأجر
    try {
      await this.tryAutoDispatch(created.entityId, tenantId);
    } catch {}

    return created.view;
  }

  // داخل class ProductsService
  async getAllOrders(status?: OrderStatus, tenantId?: string) {
    // ✅ اجلب أسعار العملات ضمن نفس التينانت (لو مُمرَّر)، وإلا fallback للكل
    const currencies = await (tenantId
      ? this.currenciesRepo.find({ where: { tenantId } as any })
      : this.currenciesRepo.find());

    const getRate = (code: string) => {
      const row = currencies.find((c) => c.code.toUpperCase() === code.toUpperCase());
      return row ? Number(row.rate) : undefined;
    };
    const TRY_RATE = getRate('TRY') ?? 1;

    const toTRY = (amount: number, code?: string, tenantId?: string) => {
      const c = (code || 'TRY').toUpperCase();
      if (c === 'TRY') return amount;
      const r = getRate(c);
      if (!r || !Number.isFinite(r) || r <= 0) return amount;
      return amount * (TRY_RATE / r);
    };

    const pickImage = (obj: any): string | null => {
      if (!obj) return null;
      return obj.imageUrl ?? obj.image ?? obj.logoUrl ?? obj.iconUrl ?? obj.icon ?? null;
    };

    // (نبقيها كما هي لتجنّب كسر التواقيع؛ خدمة integrations.list قد تكون تُراعي التينانت أصلاً)
    const integrations = await this.integrations.list(String(tenantId));
    const providersMap = new Map<string, string>();
    for (const it of integrations as any[]) providersMap.set(it.id, it.provider);

    const query = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.currency', 'currency')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.package', 'package')
      .orderBy('order.createdAt', 'DESC');

    if (status) query.where('order.status = :status', { status });
    this.addTenantWhere(query, 'user', tenantId); // ✅ نقيّد حسب tenant عبر المستخدم

    const orders = await query.getMany();

    const approvedIds = orders.filter(o => o.status === 'approved').map(o => o.id);
    let frozenMap = new Map<string, {
      fxLocked: boolean;
      sellTryAtApproval: number | null;
      costTryAtApproval: number | null;
      profitTryAtApproval: number | null;
      approvedLocalDate: string | null;
    }>();

    if (approvedIds.length) {
      const rows = await this.ordersRepo.query(
        `SELECT id,
                COALESCE("fxLocked", false)           AS "fxLocked",
                "sellTryAtApproval",
                "costTryAtApproval",
                "profitTryAtApproval",
                "approvedLocalDate"
          FROM "product_orders"
          WHERE id = ANY($1::uuid[])`,
        [approvedIds],
      );
      frozenMap = new Map(
        rows.map((r: any) => [
          String(r.id),
          {
            fxLocked: !!r.fxLocked,
            sellTryAtApproval: r.sellTryAtApproval != null ? Number(r.sellTryAtApproval) : null,
            costTryAtApproval: r.costTryAtApproval != null ? Number(r.costTryAtApproval) : null,
            profitTryAtApproval: r.profitTryAtApproval != null ? Number(r.profitTryAtApproval) : null,
            approvedLocalDate: r.approvedLocalDate ? String(r.approvedLocalDate) : null,
          },
        ]),
      );
    }

    return orders.map((order) => {
      const priceUSD = Number(order.price) || 0;
      const unitPriceUSD = order.quantity ? priceUSD / Number(order.quantity) : priceUSD;

      const providerType = order.providerId ? providersMap.get(order.providerId) : undefined;
      const isExternal = !!(order.providerId && order.externalOrderId);

      const frozen = frozenMap.get(order.id);
      const isFrozen = !!(frozen && frozen.fxLocked && order.status === 'approved');

      let sellTRY: number;
      let costTRY: number;
      let profitTRY: number;

      if (isFrozen) {
        sellTRY = Number((frozen!.sellTryAtApproval ?? 0).toFixed(2));
        costTRY = Number((frozen!.costTryAtApproval ?? 0).toFixed(2));
        const profitFrozen =
          frozen!.profitTryAtApproval != null
            ? Number(frozen!.profitTryAtApproval)
            : (sellTRY - costTRY);
        profitTRY = Number(profitFrozen.toFixed(2));
      } else {
        if (isExternal) {
          const amt = Math.abs(Number(order.costAmount ?? 0));
          let cur = String(order.costCurrency || '').toUpperCase().trim();
          if (providerType === 'znet') cur = 'TRY';
          if (!cur) cur = 'USD';
          costTRY = toTRY(amt, cur);
        } else {
          const baseUSD = Number((order as any).package?.basePrice ?? (order as any).package?.capital ?? 0);
          const qty = Number(order.quantity ?? 1);
          costTRY = (baseUSD * qty) * TRY_RATE;
        }

        sellTRY = priceUSD * TRY_RATE;
        profitTRY = sellTRY - costTRY;

        sellTRY = Number(sellTRY.toFixed(2));
        costTRY  = Number(costTRY.toFixed(2));
        profitTRY = Number(profitTRY.toFixed(2));
      }

      const userRate = order.user?.currency ? Number(order.user.currency.rate) : 1;
      const userCode = order.user?.currency ? order.user.currency.code : 'USD';
      const totalUser = priceUSD * userRate;
      const unitUser = unitPriceUSD * userRate;

      return {
        id: order.id,
        orderNo: (order as any).orderNo ?? null,
        username: (order.user as any)?.username ?? null,
        status: order.status,
        externalStatus: (order as any).externalStatus,
        externalOrderId: order.externalOrderId ?? null,
        providerId: order.providerId ?? null,

        quantity: order.quantity,

        price: totalUser,
        currencyCode: userCode,
        unitPrice: unitUser,
        priceUSD,
        unitPriceUSD,
        display: { currencyCode: userCode, unitPrice: unitUser, totalPrice: totalUser },

        currencyTRY: 'TRY',
        sellTRY,
        costTRY,
        profitTRY,

        costAmount: order.costAmount ?? null,
        costCurrency: order.costCurrency ?? null,

        fxLocked: isFrozen,
        approvedLocalDate: frozen?.approvedLocalDate ?? null,

        sentAt: order.sentAt ? order.sentAt.toISOString() : null,
        lastSyncAt: (order as any).lastSyncAt ? (order as any).lastSyncAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,

        createdAt: order.createdAt.toISOString(),
        userEmail: order.user?.email || 'غير معروف',
        extraField: (order as any).extraField ?? null,

        product: { id: order.product?.id, name: order.product?.name, imageUrl: pickImage((order as any).product) },
        package: { id: order.package?.id, name: order.package?.name, imageUrl: pickImage((order as any).package) },

        providerMessage: (order as any).providerMessage ?? (order as any).lastMessage ?? null,
        pinCode:        (order as any).pinCode ?? null,
        notesCount:     Array.isArray((order as any).notes) ? (order as any).notes.length : 0,
        manualNote:     (order as any).manualNote ?? null,
        lastMessage:    (order as any).lastMessage ?? null,
      };
    });
  }

  // ------------------
  async getUserOrders(userId: string, tenantId?: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId } as any,
      relations: ['currency'],
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (tenantId) this.ensureSameTenant((user as any).tenantId, tenantId);

    const rate = user.currency ? Number(user.currency.rate) : 1;
    const code = user.currency ? user.currency.code : 'USD';

    const orders = await this.ordersRepo.find({
      where: { user: { id: userId } as any },
      relations: ['product', 'package'],
      order: { createdAt: 'DESC' as any },
    });

    const pickImage = (obj: any): string | null =>
      obj ? (obj.imageUrl ?? obj.image ?? obj.logoUrl ?? obj.iconUrl ?? obj.icon ?? null) : null;

    return orders.map((order) => {
      const priceUSD = Number(order.price) || 0;
      const unitPriceUSD = order.quantity ? priceUSD / Number(order.quantity) : priceUSD;

      return {
        id: order.id,
        status: order.status,
        quantity: order.quantity,
        priceUSD,
        unitPriceUSD,
        display: {
          currencyCode: code,
          unitPrice: unitPriceUSD * rate,
          totalPrice: priceUSD * rate,
        },
        createdAt: order.createdAt,
        userIdentifier: order.userIdentifier ?? null,
        extraField: (order as any).extraField ?? null,

        providerMessage: (order as any).providerMessage ?? (order as any).lastMessage ?? null,
        pinCode: (order as any).pinCode ?? null,
        lastMessage: (order as any).lastMessage ?? null,

        product: { id: order.product.id, name: order.product.name, imageUrl: pickImage(order.product) },
        package: { id: order.package.id, name: order.package.name, imageUrl: pickImage(order.package), productId: order.product.id },
      };
    });
  }

  // =============== ✅ تجميد FX عند الاعتماد (Idempotent) ===============
  private async freezeFxOnApprovalIfNeeded(orderId: string): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId } as any,
      relations: ['user', 'user.currency', 'package'],
    });
    if (!order) return;

    const locked = (order as any).fxLocked === true;
    if (locked) return;

    // ✅ اجلب TRY الخاص بنفس التينانت (إن وُجد)
    const tenantId = (order as any).user?.tenantId as string | undefined;
    const tryRow = await this.currenciesRepo.findOne({
      where: tenantId
        ? ({ code: 'TRY', isActive: true, tenantId } as any)
        : ({ code: 'TRY', isActive: true } as any),
    });
    const fxUsdTry = tryRow?.rate ? Number(tryRow.rate) : 1;

    const priceUSD = Number(order.price || 0);
    const sellTryAtApproval = Number((priceUSD * fxUsdTry).toFixed(2));

    let costTryAtApproval = 0;
    const costAmount = order.costAmount != null ? Math.abs(Number(order.costAmount)) : null;
    let costCur = (order.costCurrency as any) ? String(order.costCurrency).toUpperCase().trim() : '';
    if (costAmount && costAmount > 0) {
      if (!costCur) costCur = 'USD';

      if (costCur === 'TRY') {
        costTryAtApproval = Number(costAmount.toFixed(2));
      } else if (costCur === 'USD') {
        costTryAtApproval = Number((costAmount * fxUsdTry).toFixed(2));
      } else {
        // ✅ لو عملة أخرى، نجيب سعرها من نفس التينانت إن أمكن
        const curRow = await this.currenciesRepo.findOne({
          where: tenantId ? ({ code: costCur, tenantId } as any) : ({ code: costCur } as any),
        });
        const r = curRow?.rate ? Number(curRow.rate) : undefined;
        costTryAtApproval = r && r > 0 ? Number((costAmount * (fxUsdTry / r)).toFixed(2)) : Number(costAmount.toFixed(2));
      }
    } else {
      const baseUSD = Number((order as any)?.package?.basePrice ?? (order as any)?.package?.capital ?? 0);
      const qty = Number(order.quantity ?? 1);
      costTryAtApproval = Number(((baseUSD * qty) * fxUsdTry).toFixed(2));
    }

    const profitTryAtApproval = Number((sellTryAtApproval - costTryAtApproval).toFixed(2));
    const profitUsdAtApproval  = fxUsdTry > 0 ? Number((profitTryAtApproval / fxUsdTry).toFixed(2)) : 0;

    const approvedAt = (order as any).approvedAt ? new Date((order as any).approvedAt) : new Date();

    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(approvedAt);
    const y = parts.find(p => p.type === 'year')?.value ?? '1970';
    const m = parts.find(p => p.type === 'month')?.value ?? '01';
    const d = parts.find(p => p.type === 'day')?.value ?? '01';
    const approvedLocalDate = `${y}-${m}-${d}`;
    const approvedLocalMonth = `${y}-${m}`;

    await this.ordersRepo.update(
      { id: order.id },
      {
        ...( { fxUsdTryAtApproval: fxUsdTry } as any ),
        ...( { sellTryAtApproval } as any ),
        ...( { costTryAtApproval } as any ),
        ...( { profitTryAtApproval } as any ),
        ...( { profitUsdAtApproval } as any ),
        ...( { fxCapturedAt: new Date() } as any ),
        ...( { approvedAt } as any ),
        ...( { approvedLocalDate } as any ),
        ...( { approvedLocalMonth } as any ),
        ...( { fxLocked: true } as any ),
      } as any
    );
  }

  // ------------------------
  async updateOrderStatus(orderId: string, status: OrderStatus, tenantId?: string) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId } as any,
      relations: ['user', 'user.currency', 'package'],
    });
    if (!order) return null;
    
    // ✅ تعريف مرّة وحدة
    const effectiveTenantId = String(tenantId ?? (order as any)?.user?.tenantId);

    const row = await this.ordersRepo.query(
      `SELECT "approvedLocalDate" FROM "product_orders" WHERE id = $1 LIMIT 1`,
      [orderId],
    );
    const approvedLocalDate: Date | null =
      row?.[0]?.approvedLocalDate ? new Date(row[0].approvedLocalDate) : null;

    if (order.status === 'approved' && status !== 'approved') {
      const approvedLocalDateStr =
        approvedLocalDate ? approvedLocalDate.toISOString().slice(0, 10) : undefined;

      if (approvedLocalDateStr) {
        await this.accounting.assertApprovedMonthOpen(approvedLocalDateStr);
      }
    }

    const prevStatus = order.status;
    console.log('[SERVICE updateOrderStatus] change', {
      orderId: orderId,
      prevStatus,
      nextStatus: status,
      userId: order.user?.id,
    });

    const user = order.user;

    const rate = user?.currency ? Number(user.currency.rate) : 1;
    const priceUSD = Number(order.price) || 0;
    const amountInUserCurrency = priceUSD * rate;

    let deltaUser = 0;

    if (status === 'rejected' && prevStatus !== 'rejected') {
      user.balance = Number(user.balance || 0) + amountInUserCurrency;
      await this.usersRepo.save(user);
      deltaUser = amountInUserCurrency;
    }

    if (status === 'approved' && prevStatus === 'rejected') {
      const balance = Number(user.balance) || 0;
      const overdraft = Number(user.overdraftLimit) || 0;

      if (balance - amountInUserCurrency < -overdraft) {
        throw new ConflictException('الرصيد غير كافٍ لإعادة خصم الطلب (تجاوز حد السالب المسموح)');
      }

      user.balance = balance - amountInUserCurrency;
      await this.usersRepo.save(user);
      deltaUser = -amountInUserCurrency;
    }

    order.status = status;
    const saved = await this.ordersRepo.save(order);
    console.log('[SERVICE updateOrderStatus] saved', { orderId: saved.id, status: saved.status });

    if (status === 'approved') {
      try { await this.freezeFxOnApprovalIfNeeded(saved.id); } catch {}
    }
    if (prevStatus === 'approved' && status !== 'approved') {
      await this.ordersRepo.update(
        { id: order.id },
        {
          ...( { fxLocked: false } as any ),
          ...( { fxUsdTryAtApproval: null } as any ),
          ...( { sellTryAtApproval: null } as any ),
          ...( { costTryAtApproval: null } as any ),
          ...( { profitTryAtApproval: null } as any ),
          ...( { profitUsdAtApproval: null } as any ),
          ...( { fxCapturedAt: null } as any ),
          ...( { approvedAt: null } as any ),
          ...( { approvedLocalDate: null } as any ),
          ...( { approvedLocalMonth: null } as any ),
        } as any
      );
    }

    // ✅ استخدام نفس المتغيّر
    await this.notifications.orderStatusChanged(
      user.id,
      effectiveTenantId,
      saved.id,
      prevStatus as 'approved' | 'rejected' | 'pending',
      status as   'approved' | 'rejected' | 'pending',
      {
        deltaAmountUserCurrency: Number(deltaUser || 0),
        packageName: order.package?.name ?? undefined,
        userIdentifier: order.userIdentifier || undefined,
      },
    );

    return saved;
  }

  // ================== أدوات مساعدة للعرض ==================
  private async getUserDisplayContext(userId: string, tenantId?: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId } as any,
      relations: ['currency', 'priceGroup'],
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    // 🔐 تأكد انتماء المستخدم لنفس المستأجر (إن تم تمرير tenantId)
    this.ensureSameTenant((user as any).tenantId, tenantId);

    let rate = 1;
    let code = 'USD';
    let priceGroupId: string | null = null;

    if (user?.currency?.rate) {
      rate = Number(user.currency.rate);
      code = user.currency.code;
    }
    if (user?.priceGroup?.id) {
      priceGroupId = user.priceGroup.id;
    }
    return { rate, code, priceGroupId };
  }

  private mapProductForUser(product: Product, rate: number, priceGroupId: string | null) {
    const base = {
      id: product.id,
      name: product.name,
      description: (product as any)['description'] ?? null,
      imageUrl: product.imageUrl ?? null,
    };

    return {
      ...base,
      packages: product.packages.map((pkg) => {
        const groupMatch = (pkg.prices ?? []).find(
          (p) => p.priceGroup?.id && priceGroupId && p.priceGroup.id === priceGroupId
        );

        const effectiveUSD = groupMatch
          ? Number(groupMatch.price ?? 0)
          : Number(pkg.basePrice ?? pkg.capital ?? 0);

        return {
          id: pkg.id,
          name: pkg.name,
          description: pkg.description ?? null,
          imageUrl: pkg.imageUrl ?? null,
          isActive: pkg.isActive,
          basePrice: Number(effectiveUSD) * rate,
          prices: (pkg.prices ?? []).map((p) => ({
            id: p.id,
            groupId: p.priceGroup.id,
            groupName: p.priceGroup.name,
            price: Number(p.price ?? 0) * rate,
          })),
        };
      }),
    };
  }

  async findAllForUser(tenantId: string, userId: string) {
    const { rate, code, priceGroupId } = await this.getUserDisplayContext(userId, tenantId);

    const products = await this.productsRepo.find({
      where: { tenantId } as any,
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
      order: { name: 'ASC' },
    });

    return {
      currencyCode: code,
      items: products.map((p) => this.mapProductForUser(p, rate, priceGroupId)),
    };
  }

  async findOneForUser(tenantId: string, productId: string, userId: string) {
    const { rate, code, priceGroupId } = await this.getUserDisplayContext(userId, tenantId);

    const product = await this.productsRepo.findOne({
      where: { id: productId, tenantId } as any,
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
    });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');

    return {
      currencyCode: code,
      ...this.mapProductForUser(product, rate, priceGroupId),
    };
  }

  async listOrdersWithPagination(dto: ListOrdersDto, tenantId?: string) {
    const limit = Math.max(1, Math.min(100, dto.limit ?? 25));
    const cursor = decodeCursor(dto.cursor);

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'u')
      .leftJoinAndSelect('u.currency', 'uc')
      .leftJoinAndSelect('o.package', 'pkg')
      .leftJoinAndSelect('o.product', 'prod');

    const userIdFilter = (dto as any)?.userId as string | undefined;
    if (userIdFilter) {
      qb.andWhere('u.id = :uid', { uid: userIdFilter });
    }

    if (dto.status) qb.andWhere('o.status = :status', { status: dto.status });
    if (dto.method === 'manual') {
      qb.andWhere('(o.providerId IS NULL OR o.externalOrderId IS NULL)');
    } else if (dto.method) {
      qb.andWhere('o.providerId = :pid AND o.externalOrderId IS NOT NULL', { pid: dto.method });
    }
    if (dto.from) qb.andWhere('o.createdAt >= :from', { from: new Date(dto.from + 'T00:00:00Z') });
    if (dto.to)   qb.andWhere('o.createdAt <= :to',   { to:   new Date(dto.to   + 'T23:59:59Z') });

    const _q = (dto.q ?? '').trim();
    if (_q) {
      if (/^\d+$/.test(_q)) {
        const qd = _q;
        qb.andWhere(new Brackets((b) => {
          b.where('CAST(o.orderNo AS TEXT) = :qd', { qd })
            .orWhere('o.userIdentifier = :qd', { qd })
            .orWhere('o.externalOrderId = :qd', { qd });
        }));
      } else {
        const q = `%${_q.toLowerCase()}%`;
        qb.andWhere(new Brackets((b) => {
          b.where('LOWER(prod.name) LIKE :q', { q })
            .orWhere('LOWER(pkg.name) LIKE :q', { q })
            .orWhere('LOWER(u.username) LIKE :q', { q })
            .orWhere('LOWER(u.email) LIKE :q', { q })
            .orWhere('LOWER(o.userIdentifier) LIKE :q', { q })
            .orWhere('LOWER(o.externalOrderId) LIKE :q', { q });
        }));
      }
    }

    // 🔐 تقييد المستأجر
    this.addTenantWhere(qb, 'u', tenantId);

    if (cursor) {
      qb.andWhere(new Brackets((b) => {
        b.where('o.createdAt < :cts', { cts: new Date(cursor.ts) })
          .orWhere(new Brackets((bb) => {
            bb.where('o.createdAt = :cts', { cts: new Date(cursor.ts) })
              .andWhere('o.id < :cid', { cid: cursor.id });
          }));
      }));
    }

    qb.orderBy('o.createdAt', 'DESC').addOrderBy('o.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    // ====== حسابات TRY مثل getAllOrders (✅ بحدود التينانت) ======
    const currencies = await (tenantId
      ? this.currenciesRepo.find({ where: { tenantId } as any })
      : this.currenciesRepo.find());
    const getRate = (code: string) => {
      const row = currencies.find((c) => c.code.toUpperCase() === code.toUpperCase());
      return row ? Number(row.rate) : undefined;
    };
    const TRY_RATE = getRate('TRY') ?? 1;
    const toTRY = (amount: number, code?: string) => {
      const c = (code || 'TRY').toUpperCase();
      const r = getRate(c);
      return r && r > 0 ? amount * (TRY_RATE / r) : amount;
    };

    const integrations = await this.integrations.list(tenantId ?? '');
    const providerKind = new Map<string, string>();
    for (const it of integrations as any[]) providerKind.set(it.id, it.provider);

    const pickImage = (obj: any): string | null =>
      obj ? (obj.imageUrl ?? obj.image ?? obj.logoUrl ?? obj.iconUrl ?? obj.icon ?? null) : null;

    const approvedIds = pageItems.filter((o) => o.status === 'approved').map((o) => o.id);
    let frozenMap = new Map<
      string,
      {
        fxLocked: boolean;
        sellTryAtApproval: number | null;
        costTryAtApproval: number | null;
        profitTryAtApproval: number | null;
        approvedLocalDate: string | null;
      }
    >();

    if (approvedIds.length) {
      const rowsFx = await this.ordersRepo.query(
        `SELECT id,
                COALESCE("fxLocked", false)           AS "fxLocked",
                "sellTryAtApproval",
                "costTryAtApproval",
                "profitTryAtApproval",
                "approvedLocalDate"
        FROM "product_orders"
        WHERE id = ANY($1::uuid[])`,
        [approvedIds],
      );
      frozenMap = new Map(
        rowsFx.map((r: any) => [
          String(r.id),
          {
            fxLocked: !!r.fxLocked,
            sellTryAtApproval: r.sellTryAtApproval != null ? Number(r.sellTryAtApproval) : null,
            costTryAtApproval: r.costTryAtApproval != null ? Number(r.costTryAtApproval) : null,
            profitTryAtApproval: r.profitTryAtApproval != null ? Number(r.profitTryAtApproval) : null,
            approvedLocalDate: r.approvedLocalDate ? String(r.approvedLocalDate) : null,
          },
        ]),
      );
    }

    const items = pageItems.map((o) => {
      const priceUSD = Number((o as any).price || 0);
      const unitPriceUSD = o.quantity ? priceUSD / Number(o.quantity) : priceUSD;

      const isExternal = !!(o.providerId && o.externalOrderId);
      const providerType = o.providerId ? providerKind.get(o.providerId) : undefined;

      const frozen = frozenMap.get(o.id);
      const isFrozen = !!(frozen && frozen.fxLocked && o.status === 'approved');

      let sellTRY: number;
      let costTRY: number;
      let profitTRY: number;

      if (isFrozen) {
        sellTRY = Number((frozen!.sellTryAtApproval ?? 0).toFixed(2));
        costTRY = Number((frozen!.costTryAtApproval ?? 0).toFixed(2));
        const pf =
          frozen!.profitTryAtApproval != null
            ? Number(frozen!.profitTryAtApproval)
            : sellTRY - costTRY;
        profitTRY = Number(pf.toFixed(2));
      } else {
        if (isExternal) {
          const amt = Math.abs(Number((o as any).costAmount ?? 0));
          let cur = String((o as any).costCurrency || '').toUpperCase().trim();
          if (providerType === 'znet') cur = 'TRY';
          if (!cur) cur = 'USD';
          costTRY = toTRY(amt, cur);
        } else {
          const baseUSD = Number(((o as any).package?.basePrice ?? (o as any).package?.capital ?? 0));
          const qty = Number(o.quantity ?? 1);
          costTRY = baseUSD * qty * TRY_RATE;
        }

        sellTRY = priceUSD * TRY_RATE;
        profitTRY = sellTRY - costTRY;

        sellTRY = Number(sellTRY.toFixed(2));
        costTRY = Number(costTRY.toFixed(2));
        profitTRY = Number(profitTRY.toFixed(2));
      }

      const userRate = (o as any).user?.currency ? Number((o as any).user.currency.rate) : 1;
      const userCode = (o as any).user?.currency ? (o as any).user.currency.code : 'USD';
      const totalUser = priceUSD * userRate;
      const unitUser  = unitPriceUSD * userRate;

      const username = (o as any).user?.username ?? null;
      const userEmail = (o as any).user?.email ?? null;

      return {
        id: o.id,
        orderNo: (o as any).orderNo ?? null,
        status: o.status,
        createdAt: o.createdAt?.toISOString?.() ?? new Date(o.createdAt as any).toISOString(),
        username,
        userEmail,

        providerId: o.providerId ?? null,
        externalOrderId: o.externalOrderId ?? null,
        userIdentifier: o.userIdentifier ?? null,
        extraField: (o as any).extraField ?? null,
        quantity: o.quantity,

        priceUSD,
        unitPriceUSD,
        display: {
          currencyCode: userCode,
          unitPrice: unitUser,
          totalPrice: totalUser,
        },

        currencyTRY: 'TRY',
        sellTRY,
        costTRY,
        profitTRY,

        product: o.product
          ? { id: o.product.id, name: o.product.name, imageUrl: pickImage(o.product) }
          : null,
        package: o.package
          ? { id: o.package.id, name: o.package.name, imageUrl: pickImage(o.package) }
          : null,

        sentAt: (o as any).sentAt ? (o as any).sentAt.toISOString?.() ?? null : null,
        completedAt: (o as any).completedAt
          ? (o as any).completedAt.toISOString?.() ?? null
          : null,

        fxLocked: isFrozen,
        approvedLocalDate: frozen?.approvedLocalDate ?? null,

        providerMessage: (o as any).providerMessage ?? (o as any).lastMessage ?? null,
        pinCode:        (o as any).pinCode ?? null,
        notesCount:     Array.isArray((o as any).notes) ? (o as any).notes.length : 0,
        manualNote:     (o as any).manualNote ?? null,
        lastMessage:    (o as any).lastMessage ?? null,
      };
    });

    const last = items[items.length - 1] || null;
    const nextCursor = last ? encodeCursor(toEpochMs(new Date(last.createdAt)), String(last.id)) : null;

    return {
      items,
      pageInfo: { nextCursor, hasMore },
      meta: {
        limit,
        appliedFilters: {
          q: dto.q || '',
          status: dto.status || '',
          method: dto.method || '',
          from: dto.from || '',
          to: dto.to || '',
        },
      },
    };
  }

  async listOrdersForAdmin(dto: ListOrdersDto, tenantId?: string) {
    const limit = Math.max(1, Math.min(100, dto.limit ?? 25));
    const cursor = decodeCursor(dto.cursor);

    // ✅ أسعار العملات حسب التينانت
    const currencies = await (tenantId
      ? this.currenciesRepo.find({ where: { tenantId } as any })
      : this.currenciesRepo.find());
    const getRate = (code: string) => {
      const row = currencies.find((c) => c.code.toUpperCase() === code.toUpperCase());
      return row ? Number(row.rate) : undefined;
    };
    const TRY_RATE = getRate('TRY') ?? 1;
    const toTRY = (amount: number, code?: string) => {
      const c = (code || 'TRY').toUpperCase();
      if (c === 'TRY') return amount;
      const r = getRate(c);
      if (!r || !Number.isFinite(r) || r <= 0) return amount;
      return amount * (TRY_RATE / r);
    };

    const pickImage = (obj: any): string | null =>
      obj ? (obj.imageUrl ?? obj.image ?? obj.logoUrl ?? obj.iconUrl ?? obj.icon ?? null) : null;

    const providersMap = new Map<string, string>();
    if (tenantId) {
      const integrations = await this.integrations.list(tenantId);
      for (const it of integrations as any[]) providersMap.set(it.id, it.provider);
    }

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'u')
      .leftJoinAndSelect('u.currency', 'uc')
      .leftJoinAndSelect('o.product', 'prod')
      .leftJoinAndSelect('o.package', 'pkg');

    if (dto.status) qb.andWhere('o.status = :status', { status: dto.status });

    if (dto.method === 'manual') {
      qb.andWhere('(o.providerId IS NULL OR o.externalOrderId IS NULL)');
    } else if (dto.method) {
      qb.andWhere('o.providerId = :pid AND o.externalOrderId IS NOT NULL', { pid: dto.method });
    }

    if (dto.from) qb.andWhere('o.createdAt >= :from', { from: new Date(dto.from + 'T00:00:00Z') });
    if (dto.to)   qb.andWhere('o.createdAt <= :to',   { to:   new Date(dto.to   + 'T23:59:59Z') });

    const _q = (dto.q ?? '').trim();
    if (_q && /^\d+$/.test(_q)) {
      const qd = _q;
      qb.andWhere(new Brackets(b => {
        b.where('CAST(o.orderNo AS TEXT) = :qd', { qd })
        .orWhere('o.userIdentifier = :qd', { qd })
        .orWhere('o.externalOrderId = :qd', { qd });
      }));
    } else if (_q) {
      const q = `%${_q.toLowerCase()}%`;
      qb.andWhere(new Brackets(b => {
        b.where('LOWER(prod.name) LIKE :q', { q })
        .orWhere('LOWER(pkg.name) LIKE :q', { q })
        .orWhere('LOWER(u.username) LIKE :q', { q })
        .orWhere('LOWER(u.email) LIKE :q', { q })
        .orWhere('LOWER(o.userIdentifier) LIKE :q', { q })
        .orWhere('LOWER(o.externalOrderId) LIKE :q', { q });
      }));
    }

    // 🔐 تقييد المستأجر
    this.addTenantWhere(qb, 'u', tenantId);

    if (cursor) {
      qb.andWhere(new Brackets(b => {
        b.where('o.createdAt < :cts', { cts: new Date(cursor.ts) })
        .orWhere(new Brackets(bb => {
          bb.where('o.createdAt = :cts', { cts: new Date(cursor.ts) })
            .andWhere('o.id < :cid', { cid: cursor.id });
        }));
      }));
    }

    qb.orderBy('o.createdAt', 'DESC').addOrderBy('o.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    const approvedIds = pageItems.filter(o => o.status === 'approved').map(o => o.id);
    let frozenMap = new Map<string, {
      fxLocked: boolean;
      sellTryAtApproval: number | null;
      costTryAtApproval: number | null;
      profitTryAtApproval: number | null;
      approvedLocalDate: string | null;
    }>();
    if (approvedIds.length) {
      const rowsFrozen = await this.ordersRepo.query(
        `SELECT id,
                COALESCE("fxLocked", false)           AS "fxLocked",
                "sellTryAtApproval",
                "costTryAtApproval",
                "profitTryAtApproval",
                "approvedLocalDate"
          FROM "product_orders"
          WHERE id = ANY($1::uuid[])`,
        [approvedIds],
      );
      frozenMap = new Map(
        rowsFrozen.map((r: any) => [
          String(r.id),
          {
            fxLocked: !!r.fxLocked,
            sellTryAtApproval: r.sellTryAtApproval != null ? Number(r.sellTryAtApproval) : null,
            costTryAtApproval: r.costTryAtApproval != null ? Number(r.costTryAtApproval) : null,
            profitTryAtApproval: r.profitTryAtApproval != null ? Number(r.profitTryAtApproval) : null,
            approvedLocalDate: r.approvedLocalDate ? String(r.approvedLocalDate) : null,
          },
        ]),
      );
    }

    const items = pageItems.map((o) => {
      const priceUSD = Number(o.price || 0);
      const unitPriceUSD = o.quantity ? priceUSD / Number(o.quantity) : priceUSD;

      const providerType = o.providerId ? providersMap.get(o.providerId) : undefined;
      const isExternal = !!(o.providerId && o.externalOrderId);

      const frozen = frozenMap.get(o.id);
      const isFrozen = !!(frozen && frozen.fxLocked && o.status === 'approved');

      let sellTRY: number;
      let costTRY: number;
      let profitTRY: number;

      if (isFrozen) {
        sellTRY = Number((frozen!.sellTryAtApproval ?? 0).toFixed(2));
        costTRY = Number((frozen!.costTryAtApproval ?? 0).toFixed(2));
        const p = frozen!.profitTryAtApproval != null
          ? Number(frozen!.profitTryAtApproval)
          : (sellTRY - costTRY);
        profitTRY = Number(p.toFixed(2));
      } else {
        if (isExternal) {
          const amt = Math.abs(Number(o.costAmount ?? 0));
          let cur = String(o.costCurrency || '').toUpperCase().trim();
          if (providerType === 'znet') cur = 'TRY';
          if (!cur) cur = 'USD';
          costTRY = toTRY(amt, cur);
        } else {
          const baseUSD = Number((o as any).package?.basePrice ?? (o as any).package?.capital ?? 0);
          const qty = Number(o.quantity ?? 1);
          costTRY = (baseUSD * qty) * TRY_RATE;
        }

        sellTRY   = priceUSD * TRY_RATE;
        profitTRY = sellTRY - costTRY;

        sellTRY   = Number(sellTRY.toFixed(2));
        costTRY   = Number(costTRY.toFixed(2));
        profitTRY = Number(profitTRY.toFixed(2));
      }

      const userRate = o.user?.currency ? Number(o.user.currency.rate) : 1;
      const userCode = o.user?.currency ? o.user.currency.code : 'USD';

      return {
        id: o.id,
        orderNo: (o as any).orderNo ?? null,
        username: (o.user as any)?.username ?? null,
        userEmail: (o.user as any)?.email ?? null,

        product: { id: o.product?.id, name: o.product?.name, imageUrl: pickImage((o as any).product) },
        package: { id: o.package?.id, name: o.package?.name, imageUrl: pickImage((o as any).package) },

        status: o.status,
        providerId: o.providerId ?? null,
        externalOrderId: o.externalOrderId ?? null,
        userIdentifier: o.userIdentifier ?? null,
        extraField: (o as any).extraField ?? null,

        quantity: o.quantity,
        priceUSD,
        sellTRY,
        costTRY,
        profitTRY,
        currencyTRY: 'TRY',

        sellPriceAmount: priceUSD * userRate,
        sellPriceCurrency: userCode,

        fxLocked: isFrozen,
        approvedLocalDate: frozen?.approvedLocalDate ?? null,

        sentAt: o.sentAt ? o.sentAt.toISOString() : null,
        completedAt: o.completedAt ? o.completedAt.toISOString() : null,
        durationMs: (o as any).durationMs ?? null,
        createdAt: o.createdAt.toISOString(),

        providerMessage: (o as any).providerMessage ?? (o as any).lastMessage ?? null,
        pinCode:        (o as any).pinCode ?? null,
        notesCount:     Array.isArray((o as any).notes) ? (o as any).notes.length : 0,
        manualNote:     (o as any).manualNote ?? null,
        lastMessage:    (o as any).lastMessage ?? null,
      };
    });

    const last = items[items.length - 1] || null;
    const nextCursor = last ? encodeCursor(toEpochMs(new Date(last.createdAt)), String(last.id)) : null;

    return {
      items,
      pageInfo: { nextCursor, hasMore },
      meta: {
        limit,
        appliedFilters: {
          q: dto.q || '',
          status: dto.status || '',
          method: dto.method || '',
          from: dto.from || '',
          to: dto.to || '',
        },
      },
    };
  }

  // ✅ إضافة/قراءة ملاحظات الطلب
  async addOrderNote(orderId: string, by: 'admin' | 'system' | 'user', text: string, tenantId?: string) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId } as any,
      relations: ['user'],
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    this.ensureSameTenant((order as any).user?.tenantId, tenantId);

    const now = new Date().toISOString();
    const note = { by, text: String(text || '').slice(0, 500), at: now };

    const current: any[] = Array.isArray((order as any).notes) ? (order as any).notes : [];
    (order as any).notes = [...current, note];
    (order as any).notesCount = (order as any).notes.length;

    await this.ordersRepo.save(order);
    return (order as any).notes;
  }

  async getOrderDetailsForUser(orderId: string, userId: string, tenantId?: string) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId, user: { id: userId } as any } as any,
      relations: ['product', 'package', 'user', 'user.currency'],
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    // 🔐 تأكيد انتماء الطلب لنفس المستأجر
    this.ensureSameTenant((order as any).user?.tenantId, tenantId);

    const priceUSD = Number(order.price) || 0;
    const rate = order.user?.currency ? Number(order.user.currency.rate) : 1;
    const code = order.user?.currency ? order.user.currency.code : 'USD';

    return {
      id: order.id,
      status: order.status,
      quantity: order.quantity,
      createdAt: order.createdAt,
      userIdentifier: order.userIdentifier ?? null,
      extraField: (order as any).extraField ?? null,

      priceUSD,
      unitPriceUSD: order.quantity ? priceUSD / Number(order.quantity) : priceUSD,
      display: {
        currencyCode: code,
        unitPrice: (order.quantity ? priceUSD / Number(order.quantity) : priceUSD) * rate,
        totalPrice: priceUSD * rate,
      },

      product: { id: order.product?.id, name: order.product?.name, imageUrl: (order as any).product?.imageUrl ?? null },
      package: { id: order.package?.id, name: order.package?.name, imageUrl: (order as any).package?.imageUrl ?? null },

      manualNote: (order as any).manualNote ?? null,
      providerMessage: (order as any).providerMessage ?? (order as any).lastMessage ?? null,
      notes: Array.isArray((order as any).notes) ? (order as any).notes : [],
    };
  }
}