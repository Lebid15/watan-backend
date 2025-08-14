import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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


export type OrderStatus = 'pending' | 'approved' | 'rejected';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepo: Repository<Product>,

    @InjectRepository(ProductPackage)
    private packagesRepo: Repository<ProductPackage>,

    @InjectRepository(PackagePrice)
    private packagePriceRepo: Repository<PackagePrice>,

    @InjectRepository(PriceGroup)
    private priceGroupsRepo: Repository<PriceGroup>,

    @InjectRepository(User)
    private usersRepo: Repository<User>,

    @InjectRepository(ProductOrder)
    private ordersRepo: Repository<ProductOrder>,

    @InjectRepository(Currency)
    private currenciesRepo: Repository<Currency>,

    @InjectRepository(OrderDispatchLog)
    private readonly logsRepo: Repository<OrderDispatchLog>,

    @InjectRepository(PackageRouting)
    private readonly routingRepo: Repository<PackageRouting>,

    @InjectRepository(PackageMapping)
    private readonly mappingRepo: Repository<PackageMapping>,

    private readonly integrations: IntegrationsService,
    private readonly notifications: NotificationsService,
    private readonly accounting: AccountingPeriodsService,
  ) {}

  async updateImage(id: string, imageUrl: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    product.imageUrl = imageUrl;
    return this.productsRepo.save(product);
  }

  // =====================================
  // 🔹 المنتجات
  // =====================================

  async findAllWithPackages(): Promise<any[]> {
    const products = await this.productsRepo.find({
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
    });

    const allPriceGroups = await this.priceGroupsRepo.find();

    return products.map((product) => ({
      ...product,
      packages: product.packages.map((pkg) => ({
        ...pkg,
        basePrice: pkg.basePrice ?? pkg.capital ?? 0,
        prices: allPriceGroups.map((group) => {
          const existingPrice = pkg.prices.find(
            (price) => price.priceGroup.id === group.id,
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

  async findOneWithPackages(id: string): Promise<any> {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
    });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');

    const allPriceGroups = await this.priceGroupsRepo.find();

    return {
      ...product,
      packages: product.packages.map((pkg) => ({
        ...pkg,
        basePrice: pkg.basePrice ?? pkg.capital ?? 0,
        prices: allPriceGroups.map((group) => {
          const existingPrice = pkg.prices.find(
            (price) => price.priceGroup.id === group.id,
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

  async update(id: string, body: Partial<Product>): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');
    Object.assign(product, body);
    return this.productsRepo.save(product);
  }

  async delete(id: string): Promise<void> {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');
    await this.productsRepo.remove(product);
  }

  // =====================================
  // 🔹 مجموعات الأسعار
  // =====================================

  async getPriceGroups(): Promise<PriceGroup[]> {
    return this.priceGroupsRepo.find();
  }

  async createPriceGroup(data: Partial<PriceGroup>): Promise<PriceGroup> {
    if (!data.name || !data.name.trim()) {
      throw new ConflictException('اسم المجموعة مطلوب');
    }

    const exists = await this.priceGroupsRepo.findOne({
      where: { name: data.name.trim() },
    });
    if (exists) throw new ConflictException('هذه المجموعة موجودة مسبقًا');

    const group = this.priceGroupsRepo.create({
      ...data,
      name: data.name.trim(),
    });
    return this.priceGroupsRepo.save(group);
  }

  async deletePriceGroup(id: string): Promise<void> {
    const group = await this.priceGroupsRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException('لم يتم العثور على المجموعة');
    await this.priceGroupsRepo.remove(group);
  }

  async getUsersPriceGroups(): Promise<{ id: string; name: string; usersCount: number }[]> {
    const groups = await this.priceGroupsRepo.find();

    return Promise.all(
      groups.map(async (group) => {
        const usersCount = await this.usersRepo.count({
          where: { priceGroup: { id: group.id } },
        });
        return { id: group.id, name: group.name, usersCount };
      }),
    );
  }

  // =====================================
  // 🔹 الباقات
  // =====================================

  async addPackageToProduct(
    productId: string,
    data: Partial<ProductPackage>,
  ): Promise<ProductPackage> {
    if (!data.name || !data.name.trim()) {
      throw new ConflictException('اسم الباقة مطلوب');
    }

    const product = await this.productsRepo.findOne({
      where: { id: productId },
      relations: ['packages'],
    });

    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');

    const initialCapital = data.capital ?? data.basePrice ?? 0;

    const newPackage = this.packagesRepo.create({
      name: data.name.trim(),
      description: data.description ?? '',
      basePrice: initialCapital,
      capital: initialCapital,
      isActive: data.isActive ?? true,
      imageUrl: data.imageUrl,
      product,
    });

    const savedPackage = await this.packagesRepo.save(newPackage);

    const priceGroups = await this.priceGroupsRepo.find();
    const prices = priceGroups.map((group) =>
      this.packagePriceRepo.create({
        package: savedPackage,
        priceGroup: group,
        price: initialCapital,
      }),
    );

    await this.packagePriceRepo.save(prices);
    savedPackage.prices = prices;

    return savedPackage;
  }

  async deletePackage(id: string): Promise<void> {
    const pkg = await this.packagesRepo.findOne({
      where: { id },
      relations: ['prices'],
    });
    if (!pkg) throw new NotFoundException('لم يتم العثور على الباقة');

    if (pkg.prices.length) {
      await this.packagePriceRepo.remove(pkg.prices);
    }
    await this.packagesRepo.remove(pkg);
  }

  async updatePackagePrices(
    packageId: string,
    data: { capital: number; prices: { groupId: string; price: number }[] },
  ) {
    const pkg = await this.packagesRepo.findOne({
      where: { id: packageId },
      relations: ['prices', 'prices.priceGroup'],
    });
    if (!pkg) throw new NotFoundException('لم يتم العثور على الباقة');

    pkg.capital = data.capital;
    pkg.basePrice = data.capital;
    await this.packagesRepo.save(pkg);

    for (const p of data.prices) {
      let priceEntity = pkg.prices.find(
        (price) => price.priceGroup.id === p.groupId,
      );

      const priceGroup = await this.priceGroupsRepo.findOne({ where: { id: p.groupId } });
      if (!priceGroup) continue;

      if (!priceEntity) {
        priceEntity = this.packagePriceRepo.create({
          package: pkg,
          priceGroup,
          price: p.price,
        });
      } else {
        priceEntity.price = p.price;
      }

      await this.packagePriceRepo.save(priceEntity);
    }

    return { message: 'تم تحديث أسعار الباقة ورأس المال بنجاح' };
  }

  // ================== التسعير الأساس (بالدولار) ==================
  private async getEffectivePriceUSD(packageId: string, userId: string): Promise<number> {
    const [pkg, user] = await Promise.all([
      this.packagesRepo.findOne({
        where: { id: packageId },
        relations: ['prices', 'prices.priceGroup'],
      }),
      this.usersRepo.findOne({
        where: { id: userId },
        relations: ['priceGroup'],
      }),
    ]);

    if (!pkg) throw new NotFoundException('الباقة غير موجودة');
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
    // pending/processing
    return 'processing';
  }

  /** محاولة إرسال الطلب تلقائيًا حسب إعدادات التوجيه (مع تجربة fallback مرة واحدة إن لزم) */
  private async tryAutoDispatch(orderId: string) {
    // 1) حمّل الطلب + الباقة
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['package', 'product', 'user'],
    });
    if (!order) return;

    // لا تحاول لو الطلب أرسل أصلاً أو انتهى
    if (order.providerId || order.externalOrderId || order.status !== 'pending') return;

    // 2) إحضار إعدادات التوجيه للباقة
    const routing = await this.routingRepo.findOne({
      where: { package: { id: order.package.id } as any },
      relations: ['package'],
    });
    if (!routing || routing.mode !== 'auto' || !routing.primaryProviderId) return;

    const tryOnce = async (providerId: string) => {
      // تحقق من وجود mapping للباقة مع هذا المزود
      const mapping = await this.mappingRepo.findOne({
        where: { our_package_id: order.package.id, provider_api_id: providerId },
      });
      if (!mapping) {
        throw new Error('لا يوجد ربط لهذه الباقة عند هذا المزوّد');
      }

      // تجهيز الحمولة للدرايفر
      const payload = {
        productId: String(mapping.provider_package_id),
        qty: Number(order.quantity || 1),
        params: {
          ...(mapping.meta || {}),
          userIdentifier: order.userIdentifier || undefined,
        },
        clientOrderUuid: order.id,
      };

      const placed = await this.integrations.placeOrder(providerId, payload);
      const cfg = await this.integrations.get(providerId);

      // استنتاج العملة من ردّ المزوّد
      let priceCurrency: string | undefined =
        (placed as any)?.costCurrency ||
        (placed as any)?.priceCurrency ||
        (placed as any)?.raw?.currency ||
        (placed as any)?.raw?.Currency;

      // حزام أمان: znet دائماً TRY
      if (cfg.provider === 'znet') priceCurrency = 'TRY';

      if (typeof priceCurrency === 'string') {
        priceCurrency = priceCurrency.toUpperCase().trim();
      } else {
        priceCurrency = 'USD';
      }

      // لو أعاد السعر/التكلفة من المزود خزّنها (إن توفرت) — بدون فرض USD أبداً
      if (typeof (placed as any)?.price === 'number' && Number.isFinite((placed as any).price)) {
        order.costAmount = Math.abs(Number((placed as any).price)) as any; // قيمة موجبة
        order.costCurrency = (priceCurrency as any) || 'USD';
      }

      // تحديث الطلب
      order.providerId = providerId;
      order.externalOrderId = (placed as any)?.externalOrderId ?? null;
      order.externalStatus = this.mapMappedToExternalStatus((placed as any)?.mappedStatus);
      order.sentAt = new Date();
      order.lastSyncAt = new Date();
      order.lastMessage = String(
        (placed as any)?.raw?.message ||
        (placed as any)?.raw?.desc ||
        (placed as any)?.providerStatus ||
        (placed as any)?.mappedStatus ||
        'sent'
      ).slice(0, 250);

      await this.ordersRepo.save(order);

      // سجل محاولة الإرسال
      await this.logsRepo.save(
        this.logsRepo.create({
          order,
          action: 'dispatch',
          result: 'success',
          message: order.lastMessage || 'sent',
          payloadSnapshot: { providerId, payload, response: placed },
        }),
      );

      // لو انتهت "done" وافق تلقائيًا، ولو "failed" ارفض
      if (order.externalStatus === 'done') {
        await this.updateOrderStatus(order.id, 'approved');
      } else if (order.externalStatus === 'failed') {
        await this.updateOrderStatus(order.id, 'rejected');
      }
    };

    // 3) جرّب الـ primary
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

    // 4) إن فشل الـ primary و لدينا fallback — جرّبه مرة واحدة
    if (routing.fallbackProviderId) {
      try {
        await tryOnce(routing.fallbackProviderId);
        return;
      } catch (err: any) {
        await this.logsRepo.save(
          this.logsRepo.create({
            order,
            action: 'dispatch',
            result: 'fail',
            message: String(err?.message || 'failed to dispatch (fallback)').slice(0, 250),
          }),
        );
      }
    }

    // إذا فشل الإثنان يبقى الطلب pending ويظهر في لوحة الأدمن كـ Manual
  }

  // ================ الطلبات =============

  async createOrder(data: {
    productId: string;
    packageId: string;
    quantity: number;
    userId: string;
    userIdentifier?: string;
  }) {
    const { productId, packageId, quantity, userId, userIdentifier } = data;

    if (!quantity || quantity <= 0 || !Number.isFinite(Number(quantity))) {
      throw new BadRequestException('Quantity must be a positive number');
    }

    // ننفّذ داخل Transaction لتجنّب حالات السباق على الرصيد
    const created = await this.ordersRepo.manager.transaction(async (trx) => {
      const productsRepo = trx.getRepository(Product);
      const packagesRepo = trx.getRepository(ProductPackage);
      const usersRepo = trx.getRepository(User);
      const ordersRepo = trx.getRepository(ProductOrder);

      const [product, user] = await Promise.all([
        productsRepo.findOne({ where: { id: productId } }),
        usersRepo.findOne({ where: { id: userId }, relations: ['currency'] }),
      ]);
      if (!product) throw new NotFoundException('المنتج غير موجود');
      if (!user) throw new NotFoundException('المستخدم غير موجود');

      if (user.isActive === false) {
        throw new ConflictException('الحساب غير فعّال');
      }

      // ✅ سعر الوحدة المناسب للمستخدم (بالدولار كأساس)
      const unitPriceUSD = await this.getEffectivePriceUSD(packageId, userId);
      const totalUSD = Number(unitPriceUSD) * Number(quantity);

      // ✅ تحويل السعر إلى عملة المستخدم (المحفظة بعملة المستخدم)
      const rate = user.currency ? Number(user.currency.rate) : 1;
      const code = user.currency ? user.currency.code : 'USD';
      const totalUser = totalUSD * rate;

      // ✅ تحقق الرصيد مع حد السالب
      const balance = Number(user.balance) || 0;
      const overdraft = Number(user.overdraftLimit) || 0;
      if (totalUser > balance + overdraft) {
        throw new ConflictException('الرصيد غير كافٍ (تجاوز حد السالب المسموح)');
      }

      // ✅ خصم بعملة المستخدم
      user.balance = balance - totalUser;
      await usersRepo.save(user);

      // ✅ إحضار الباقة
      const pkg = await packagesRepo.findOne({ where: { id: packageId } });
      if (!pkg) throw new NotFoundException('الباقة غير موجودة');

      // ✅ أنشئ الطلب (مبدئيًا pending & manual)
      const order = ordersRepo.create({
        product,
        package: pkg,
        quantity,
        price: totalUSD, // مخزّن بالدولار
        status: 'pending',
        user,
        userIdentifier: userIdentifier ?? null,
      });

      const saved = await ordersRepo.save(order);

      // ✅ إرسال تنبيه خصم محفظة
      await this.notifications.walletDebit(user.id, totalUser, saved.id);

      // ✅ نعيد البيانات المعروضة للفرونت
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
          product: { id: product.id, name: product.name },
          package: { id: pkg.id, name: pkg.name },
          userIdentifier: saved.userIdentifier ?? null,
          createdAt: saved.createdAt,
        },
      };
    });

    // ✅ بعد نجاح إنشاء الطلب ومعالجة الرصيد — جرّب التوجيه التلقائي
    try {
      await this.tryAutoDispatch(created.entityId);
    } catch (e) {
      // لا نرمي خطأ على المستخدم؛ يظل الطلب pending ويظهر للأدمن
    }

    return created.view;
  }


  // --------------------------
  async getAllOrders(status?: OrderStatus) {
    // 0) جهّز أسعار الصرف (للاحتساب الحي للحالات غير المجمّدة)
    const currencies = await this.currenciesRepo.find();
    const getRate = (code: string) => {
      const row = currencies.find((c) => c.code.toUpperCase() === code.toUpperCase());
      return row ? Number(row.rate) : undefined; // rate = كم من هذه العملة لكل 1 USD
    };
    const TRY_RATE = getRate('TRY') ?? 1;

    const toTRY = (amount: number, code?: string) => {
      const c = (code || 'TRY').toUpperCase();
      if (c === 'TRY') return amount;                // لا تحويل
      const r = getRate(c);
      if (!r || !Number.isFinite(r) || r <= 0) return amount; // فشل العثور على السعر → اعتبرها TRY
      // amount(c) -> USD -> TRY  === amount * (TRY_RATE / r)
      return amount * (TRY_RATE / r);
    };

    // 1) خريطة المزوّدين لعرض شارة الـ API
    const integrations = await this.integrations.list();
    const providersMap = new Map<string, string>();
    for (const it of integrations as any[]) providersMap.set(it.id, it.provider);

    // 2) اجلب الطلبات
    const query = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.currency', 'currency')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.package', 'package')
      .orderBy('order.createdAt', 'DESC');

    if (status) query.where('order.status = :status', { status });

    const orders = await query.getMany();

    // 3) اجلب القيم المجمّدة دفعة واحدة (حتى لو الـ Entity لا يحتوي الأعمدة)
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

    // 4) إخراج منسّق
    return orders.map((order) => {
      // السعر المخزّن بالدولار (إجمالي الطلب)
      const priceUSD = Number(order.price) || 0;
      const unitPriceUSD = order.quantity ? priceUSD / Number(order.quantity) : priceUSD;

      // هل الطلب خارجي؟
      const providerType = order.providerId ? providersMap.get(order.providerId) : undefined;
      const isExternal = !!(order.providerId && order.externalOrderId);

      // ---- وضع مجمّد؟ (للطلبات approved فقط)
      const frozen = frozenMap.get(order.id);
      const isFrozen = !!(frozen && frozen.fxLocked && order.status === 'approved');

      // القيم بالليرة التركية
      let sellTRY: number;
      let costTRY: number;
      let profitTRY: number;

      if (isFrozen) {
        // استخدم القيم المجمّدة كما هي
        sellTRY = Number((frozen!.sellTryAtApproval ?? 0).toFixed(2));
        costTRY = Number((frozen!.costTryAtApproval ?? 0).toFixed(2));
        // لو profitTryAtApproval مفقودة نحسبها فرقًا بين المجمد
        const profitFrozen =
          frozen!.profitTryAtApproval != null
            ? Number(frozen!.profitTryAtApproval)
            : (sellTRY - costTRY);
        profitTRY = Number(profitFrozen.toFixed(2));
      } else {
        // حساب حي (للطلبات غير المجمّدة)
        // تكلفة TRY:
        if (isExternal) {
          const amt = Math.abs(Number(order.costAmount ?? 0));
          let cur = String(order.costCurrency || '').toUpperCase().trim();
          if (providerType === 'znet') cur = 'TRY'; // حزام أمان
          if (!cur) cur = 'USD';
          costTRY = toTRY(amt, cur);
        } else {
          // Manual: التكلفة = basePriceUSD × الكمية × TRY_RATE
          const baseUSD = Number(
            (order as any).package?.basePrice ??
            (order as any).package?.capital ??
            0
          );
          const qty = Number(order.quantity ?? 1);
          costTRY = (baseUSD * qty) * TRY_RATE;
        }

        // بيع TRY من priceUSD
        sellTRY = priceUSD * TRY_RATE;
        profitTRY = sellTRY - costTRY;

        // تقريب
        sellTRY = Number(sellTRY.toFixed(2));
        costTRY = Number(costTRY.toFixed(2));
        profitTRY = Number(profitTRY.toFixed(2));
      }

      // الحقول القديمة: عرض بعملة المستخدم (للتوافق مع الواجهات)
      const userRate = order.user?.currency ? Number(order.user.currency.rate) : 1;
      const userCode = order.user?.currency ? order.user.currency.code : 'USD';
      const totalUser = priceUSD * userRate;
      const unitUser = unitPriceUSD * userRate;

      return {
        id: order.id,
        orderNo: (order as any).orderNo ?? null,
        username: (order.user as any)?.username ?? null,
        status: order.status,
        externalStatus: order.externalStatus,
        externalOrderId: order.externalOrderId ?? null,
        providerId: order.providerId ?? null,

        quantity: order.quantity,

        // عرض بعملة المستخدم (توافق قديم)
        price: totalUser,
        currencyCode: userCode,
        unitPrice: unitUser,
        priceUSD,
        unitPriceUSD,
        display: {
          currencyCode: userCode,
          unitPrice: unitUser,
          totalPrice: totalUser,
        },

        // عرض بالليرة التركية (المعياري)
        currencyTRY: 'TRY',
        sellTRY,
        costTRY,
        profitTRY,

        // معلومات المصدر
        costAmount: order.costAmount ?? null,
        costCurrency: order.costCurrency ?? null,

        // شارة التجميد للواجهة
        fxLocked: isFrozen,
        approvedLocalDate: frozen?.approvedLocalDate ?? null,

        // أوقات
        sentAt: order.sentAt ? order.sentAt.toISOString() : null,
        lastSyncAt: order.lastSyncAt ? order.lastSyncAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,

        createdAt: order.createdAt.toISOString(),
        userEmail: order.user?.email || 'غير معروف',
        userIdentifier: order.userIdentifier ?? null,
        product: { id: order.product.id, name: order.product.name },
        package: { id: order.package.id, name: order.package.name },
      };
    });
  }
  // ------------------
  // طلبات المستخدم (لعرضها في واجهة المستخدم)
  async getUserOrders(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['currency'],
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const rate = user.currency ? Number(user.currency.rate) : 1;
    const code = user.currency ? user.currency.code : 'USD';

    const orders = await this.ordersRepo.find({
      where: { user: { id: userId } as any },
      relations: ['product', 'package'],
      order: { createdAt: 'DESC' as any },
    });

    return orders.map((order) => {
      const priceUSD = Number(order.price) || 0; // المخزن بالدولار (إجمالي)
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
        product: { id: order.product.id, name: order.product.name },
        package: { id: order.package.id, name: order.package.name },
      };
    });
  }

  // =============== ✅ جديد: دالة التجميد عند الاعتماد (Idempotent) ===============
  private async freezeFxOnApprovalIfNeeded(orderId: string): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'user.currency', 'package'],
    });
    if (!order) return;

    const locked = (order as any).fxLocked === true;
    if (locked) return;

    // TRY per 1 USD
    const tryRow = await this.currenciesRepo.findOne({ where: { code: 'TRY', isActive: true } });
    const fxUsdTry = tryRow?.rate ? Number(tryRow.rate) : 1;

    // البيع بالليرة (price بالدولار)
    const priceUSD = Number(order.price || 0);
    const sellTryAtApproval = Number((priceUSD * fxUsdTry).toFixed(2));

    // التكلفة بالليرة
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
        const curRow = await this.currenciesRepo.findOne({ where: { code: costCur } });
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
    const approvedLocalDate = `${y}-${m}-${d}`; // YYYY-MM-DD
    const approvedLocalMonth = `${y}-${m}`;     // YYYY-MM

    await this.ordersRepo.update(
      { id: order.id },
      {
        ...( { fxUsdTryAtApproval: fxUsdTry } as any ),
        ...( { sellTryAtApproval } as any ),
        ...( { costTryAtApproval } as any ),
        ...( { profitTryAtApproval } as any ),
        ...( { profitUsdAtApproval } as any ),
        ...( { fxCapturedAt: new Date() } as any ),
        ...( { fxSource: 'local_currencies_table' } as any ),
        ...( { approvedAt } as any ),
        ...( { approvedLocalDate } as any ),
        ...( { approvedLocalMonth } as any ),
        ...( { fxLocked: true } as any ),
      } as any
    );
  }

  // ------------------------
  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'user.currency'],
    });
    if (!order) return null;

    // 🔒 منع تعديل طلب مُعتمد ضمن شهر مُقفَل
    const row = await this.ordersRepo.query(
      `SELECT "approvedLocalDate" FROM "product_orders" WHERE id = $1 LIMIT 1`,
      [orderId],
    );
    const approvedLocalDate: Date | null =
      row?.[0]?.approvedLocalDate ? new Date(row[0].approvedLocalDate) : null;

    if (order.status === 'approved' && status !== 'approved') {
      await this.accounting.assertApprovedMonthOpen(approvedLocalDate);
    }

    const prevStatus = order.status;
    const user = order.user;

    // مبلغ الطلب بعملة المستخدم (للرصيد)
    const rate = user?.currency ? Number(user.currency.rate) : 1;
    const priceUSD = Number(order.price) || 0;
    const amountInUserCurrency = priceUSD * rate;

    let deltaUser = 0;

    // استرجاع عند الرفض (فقط إذا لم يكن مرفوضًا سابقًا)
    if (status === 'rejected' && prevStatus !== 'rejected') {
      user.balance = Number(user.balance || 0) + amountInUserCurrency;
      await this.usersRepo.save(user);
      deltaUser = amountInUserCurrency;
      await this.notifications.walletTopup(
        user.id,
        amountInUserCurrency,
        `استرجاع مبلغ لرفض الطلب #${orderId}`
      );

      // ✅ إذا كان الطلب كان Approved قبل قليل: فكّ التجميد كي يُعاد تجميده عند موافقة لاحقة
      if (prevStatus === 'approved') {
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
    }

    // إعادة الخصم عند الموافقة بعد رفض سابق
    if (status === 'approved' && prevStatus === 'rejected') {
      const balance = Number(user.balance) || 0;
      const overdraft = Number(user.overdraftLimit) || 0;

      if (balance - amountInUserCurrency < -overdraft) {
        throw new ConflictException('الرصيد غير كافٍ لإعادة خصم الطلب (تجاوز حد السالب المسموح)');
      }

      user.balance = balance - amountInUserCurrency;
      await this.usersRepo.save(user);
      deltaUser = -amountInUserCurrency;
      await this.notifications.walletDebit(
        user.id,
        amountInUserCurrency,
        `إعادة خصم لموافقة الطلب #${orderId}`
      );
    }

    // تحديث الحالة
    order.status = status;
    const saved = await this.ordersRepo.save(order);

    // عند الموافقة: نفّذ التجميد (Idempotent)
    if (status === 'approved') {
      try { await this.freezeFxOnApprovalIfNeeded(saved.id); } catch {}
    }

    // إشعار تغيّر الحالة
    await this.notifications.orderStatusChanged(
      user.id,
      saved.id,
      prevStatus as any,
      status as any,
      deltaUser || 0,
    );

    return saved;
  }
  // ================== أدوات مساعدة للعرض ==================

  private async getUserDisplayContext(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['currency', 'priceGroup'],
    });

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

  async findAllForUser(userId: string) {
    const { rate, code, priceGroupId } = await this.getUserDisplayContext(userId);

    const products = await this.productsRepo.find({
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
      order: { name: 'ASC' },
    });

    return {
      currencyCode: code,
      items: products.map((p) => this.mapProductForUser(p, rate, priceGroupId)),
    };
  }

  async findOneForUser(productId: string, userId: string) {
    const { rate, code, priceGroupId } = await this.getUserDisplayContext(userId);

    const product = await this.productsRepo.findOne({
      where: { id: productId },
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
    });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');

    return {
      currencyCode: code,
      ...this.mapProductForUser(product, rate, priceGroupId),
    };
  }
}
