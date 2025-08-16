import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets  } from 'typeorm';
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
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['package', 'product', 'user'],
    });
    if (!order) return;
    if (order.providerId || order.externalOrderId || order.status !== 'pending') return;

    const routing = await this.routingRepo.findOne({
      where: { package: { id: order.package.id } as any },
      relations: ['package'],
    });
    if (!routing || routing.mode !== 'auto' || !routing.primaryProviderId) return;

    const tryOnce = async (providerId: string) => {
      const mapping = await this.mappingRepo.findOne({
        where: { our_package_id: order.package.id, provider_api_id: providerId },
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
        },
        clientOrderUuid: order.id,
      };

      const placed = await this.integrations.placeOrder(providerId, payload);
      const cfg = await this.integrations.get(providerId);

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
        await this.updateOrderStatus(order.id, 'approved');
      } else if (order.externalStatus === 'failed') {
        await this.updateOrderStatus(order.id, 'rejected');
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

      const unitPriceUSD = await this.getEffectivePriceUSD(packageId, userId);
      const totalUSD = Number(unitPriceUSD) * Number(quantity);

      const rate = user.currency ? Number(user.currency.rate) : 1;
      const code = user.currency ? user.currency.code : 'USD';
      const totalUser = totalUSD * rate;

      const balance = Number(user.balance) || 0;
      const overdraft = Number(user.overdraftLimit) || 0;
      if (totalUser > balance + overdraft) {
        throw new ConflictException('الرصيد غير كافٍ (تجاوز حد السالب المسموح)');
      }

      user.balance = balance - totalUser;
      await usersRepo.save(user);

      const pkg = await packagesRepo.findOne({ where: { id: packageId } });
      if (!pkg) throw new NotFoundException('الباقة غير موجودة');

      const order = ordersRepo.create({
        product,
        package: pkg,
        quantity,
        price: totalUSD, // بالدولار
        status: 'pending',
        user,
        userIdentifier: userIdentifier ?? null,
      });

      const saved = await ordersRepo.save(order);

      // ❌ لا نُرسل إشعار خصم هنا (سنرسل إشعارًا موحّدًا عند القبول/الرفض)
      // await this.notifications.walletDebit(user.id, totalUser, saved.id, {
      //   packageName: pkg.name,
      //   userIdentifier: userIdentifier ?? undefined,
      // });

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

    try {
      await this.tryAutoDispatch(created.entityId);
    } catch (e) {
      // يبقى الطلب pending
    }

    return created.view;
  }

  // داخل class ProductsService
  async getAllOrders(status?: OrderStatus) {
    const currencies = await this.currenciesRepo.find();
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

    // ✅ helper محلي لالتقاط أول رابط صورة صالح دون اصطدام مع أنواع الـ Entity
    const pickImage = (obj: any): string | null => {
      if (!obj) return null;
      return (
        obj.imageUrl ??
        obj.image ??
        obj.logoUrl ??
        obj.iconUrl ??
        obj.icon ??
        null
      );
    };

    const integrations = await this.integrations.list();
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
          const baseUSD = Number(
            (order as any).package?.basePrice ??
            (order as any).package?.capital ??
            0
          );
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
        display: {
          currencyCode: userCode,
          unitPrice: unitUser,
          totalPrice: totalUser,
        },

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
        userIdentifier: order.userIdentifier ?? null,

        // ✅ نعيد imageUrl موحّد للواجهة
        product: {
          id: order.product?.id,
          name: order.product?.name,
          imageUrl: pickImage((order as any).product),
        },
        package: {
          id: order.package?.id,
          name: order.package?.name,
          imageUrl: pickImage((order as any).package),
        },
      };
    });
  }

  // ------------------
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
    // التقط أول رابط صورة متاح تحت عدد من الأسماء الشائعة
    const pickImage = (obj: any): string | null => {
      if (!obj) return null;
      return (
        obj.imageUrl ??
        obj.image ??
        obj.logoUrl ??
        obj.iconUrl ??
        obj.icon ??
        null
      );
    };

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
        product: {
          id: order.product.id,
          name: order.product.name,
          imageUrl: (order.product as any)?.imageUrl ?? null,
        },
        package: {
          id: order.package.id,
          name: order.package.name,
          imageUrl: (order.package as any)?.imageUrl ?? null,
          productId: order.product.id, // اختياري، مفيد لو احتجناه لاحقًا
        },
      };
    });
  }

  // =============== ✅ تجميد FX عند الاعتماد (Idempotent) ===============
  private async freezeFxOnApprovalIfNeeded(orderId: string): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'user.currency', 'package'],
    });
    if (!order) return;

    const locked = (order as any).fxLocked === true;
    if (locked) return;

    const tryRow = await this.currenciesRepo.findOne({ where: { code: 'TRY', isActive: true } });
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
  async updateOrderStatus(orderId: string, status: OrderStatus) {
    // 👈 نحتاج الباقة هنا لكتابة اسمها في الإشعار
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'user.currency', 'package'],
    });
    if (!order) return null;

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

    const rate = user?.currency ? Number(user.currency.rate) : 1;
    const priceUSD = Number(order.price) || 0;
    const amountInUserCurrency = priceUSD * rate;

    let deltaUser = 0;

    // استرجاع عند الرفض (من غير تكرار إشعارات منفصلة)
    if (status === 'rejected' && prevStatus !== 'rejected') {
      user.balance = Number(user.balance || 0) + amountInUserCurrency;
      await this.usersRepo.save(user);
      deltaUser = amountInUserCurrency;

      // ❌ لا نرسل walletTopup إشعارًا منفصلًا
    }

    // إعادة الخصم عند الموافقة بعد رفض سابق (من غير إشعار منفصل)
    if (status === 'approved' && prevStatus === 'rejected') {
      const balance = Number(user.balance) || 0;
      const overdraft = Number(user.overdraftLimit) || 0;

      if (balance - amountInUserCurrency < -overdraft) {
        throw new ConflictException('الرصيد غير كافٍ لإعادة خصم الطلب (تجاوز حد السالب المسموح)');
      }

      user.balance = balance - amountInUserCurrency;
      await this.usersRepo.save(user);
      deltaUser = -amountInUserCurrency;

      // ❌ لا نرسل walletDebit إشعارًا منفصلًا
    }

    order.status = status;
    const saved = await this.ordersRepo.save(order);

    if (status === 'approved') {
      try { await this.freezeFxOnApprovalIfNeeded(saved.id); } catch {}
    }
    if (prevStatus === 'approved' && status !== 'approved') {
      // فك التجميد عند الرجوع عن الموافقة
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

    // ✅ إشعار موحّد بصياغة العربيّة الجديدة + إصلاح توقيع الدالة (نمرّر كائن لا رقم)
    await this.notifications.orderStatusChanged(
      user.id,
      saved.id,
      prevStatus as any,
      status as any,
      {
        deltaAmountUserCurrency: deltaUser || 0,
        packageName: order.package?.name,
        userIdentifier: order.userIdentifier || undefined,
      },
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

  // داخل class ProductsService
  async listOrdersWithPagination(dto: ListOrdersDto) {
    const limit = Math.max(1, Math.min(100, dto.limit ?? 25));
    const cursor = decodeCursor(dto.cursor);

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'u')
      .leftJoinAndSelect('o.package', 'pkg')
      .leftJoinAndSelect('o.product', 'prod');

    // الحالة
    if (dto.status) {
      qb.andWhere('o.status = :status', { status: dto.status });
    }

    // طريقة التنفيذ: '' | 'manual' | providerId
    if (dto.method === 'manual') {
      qb.andWhere('(o.providerId IS NULL OR o.externalOrderId IS NULL)');
    } else if (dto.method) {
      qb.andWhere('o.providerId = :pid AND o.externalOrderId IS NOT NULL', {
        pid: dto.method,
      });
    }

    // التاريخ
    if (dto.from) {
      qb.andWhere('o.createdAt >= :from', {
        from: new Date(dto.from + 'T00:00:00Z'),
      });
    }
    if (dto.to) {
      qb.andWhere('o.createdAt <= :to', {
        to: new Date(dto.to + 'T23:59:59Z'),
      });
    }

    // البحث الرقمي (تطابق تام: orderNo / userIdentifier / externalOrderId)
    if (dto.q && dto.isQDigitsOnly) {
      const qd = dto.qDigits;
      qb.andWhere(new Brackets((b) => {
        b.where('CAST(o.orderNo AS TEXT) = :qd', { qd })
          .orWhere('o.userIdentifier = :qd', { qd })
          .orWhere('o.externalOrderId = :qd', { qd });
      }));
    }

    // Keyset cursor
    if (cursor) {
      qb.andWhere(new Brackets((b) => {
        b.where('o.createdAt < :cts', { cts: new Date(cursor.ts) })
          .orWhere(new Brackets((bb) => {
            bb.where('o.createdAt = :cts', { cts: new Date(cursor.ts) })
              .andWhere('o.id < :cid', { cid: cursor.id });
          }));
      }));
    }

    // ترتيب + حد
    qb.orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .take(limit + 1);

    // جلب البيانات
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    const last = pageItems[pageItems.length - 1] || null;
    const nextCursor = last
      ? encodeCursor(toEpochMs(last.createdAt as any), String(last.id))
      : null;

    // ====== حسابات TRY مثل getAllOrders ======

    // أسعار الصرف
    const currencies = await this.currenciesRepo.find();
    const getRate = (code: string) => {
      const row = currencies.find((c) => c.code.toUpperCase() === code.toUpperCase());
      return row ? Number(row.rate) : undefined;
    };
    const TRY_RATE = getRate('TRY') ?? 1;
    const toTRY = (amount: number, code?: string) => {
      const c = (code || 'TRY').toUpperCase();
      if (c === 'TRY') return amount;
      const r = getRate(c);
      return r && r > 0 ? amount * (TRY_RATE / r) : amount;
    };

    // معرّف نوع المزوّد (للتحويل الخاص بـ znet)
    const integrations = await this.integrations.list();
    const providerKind = new Map<string, string>();
    for (const it of integrations as any[]) providerKind.set(it.id, it.provider);

    // أداة صورة
    const pickImage = (obj: any): string | null =>
      obj ? (obj.imageUrl ?? obj.image ?? obj.logoUrl ?? obj.iconUrl ?? obj.icon ?? null) : null;

    // المجمّدات للطلبات المعتمدة
    const approvedIds = pageItems
      .filter((o) => o.status === 'approved')
      .map((o) => o.id);

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
            sellTryAtApproval:
              r.sellTryAtApproval != null ? Number(r.sellTryAtApproval) : null,
            costTryAtApproval:
              r.costTryAtApproval != null ? Number(r.costTryAtApproval) : null,
            profitTryAtApproval:
              r.profitTryAtApproval != null ? Number(r.profitTryAtApproval) : null,
            approvedLocalDate: r.approvedLocalDate ? String(r.approvedLocalDate) : null,
          },
        ]),
      );
    }

    const items = pageItems.map((o) => {
      const priceUSD = Number((o as any).price || 0); // إجمالي بالدولار
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
        // التكلفة
        if (isExternal) {
          const amt = Math.abs(Number((o as any).costAmount ?? 0));
          let cur = String((o as any).costCurrency || '').toUpperCase().trim();
          if (providerType === 'znet') cur = 'TRY';
          if (!cur) cur = 'USD';
          costTRY = toTRY(amt, cur);
        } else {
          const baseUSD = Number(
            ((o as any).package?.basePrice ?? (o as any).package?.capital ?? 0),
          );
          const qty = Number(o.quantity ?? 1);
          costTRY = baseUSD * qty * TRY_RATE;
        }

        // البيع والربح
        sellTRY = priceUSD * TRY_RATE;
        profitTRY = sellTRY - costTRY;

        // تقريب
        sellTRY = Number(sellTRY.toFixed(2));
        costTRY = Number(costTRY.toFixed(2));
        profitTRY = Number(profitTRY.toFixed(2));
      }

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
          method: dto.method || '',
          from: dto.from || '',
          to: dto.to || '',
        },
      },
    };
  }

  async listOrdersForAdmin(dto: ListOrdersDto) {
    const limit = Math.max(1, Math.min(100, dto.limit ?? 25));
    const cursor = decodeCursor(dto.cursor);

    // --- أسعار العملات ---
    const currencies = await this.currenciesRepo.find();
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

    // --- خريطة المزوّدين لمعرفة znet إلخ
    const integrations = await this.integrations.list();
    const providersMap = new Map<string, string>();
    for (const it of integrations as any[]) providersMap.set(it.id, it.provider);

    // --- الفلاتر + keyset pagination
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

    if (dto.q && dto.isQDigitsOnly) {
      const qd = dto.qDigits;
      qb.andWhere(new Brackets(b => {
        b.where('CAST(o.orderNo AS TEXT) = :qd', { qd })
        .orWhere('o.userIdentifier = :qd', { qd })
        .orWhere('o.externalOrderId = :qd', { qd });
      }));
    } else if (dto.q) {
      const q = `%${(dto.q || '').trim().toLowerCase()}%`;
      qb.andWhere(new Brackets(b => {
        b.where('LOWER(prod.name) LIKE :q', { q })
        .orWhere('LOWER(pkg.name) LIKE :q', { q })
        .orWhere('LOWER(u.username) LIKE :q', { q })
        .orWhere('LOWER(u.email) LIKE :q', { q })
        .orWhere('LOWER(o.externalOrderId) LIKE :q', { q });
      }));
    }

    if (cursor) {
      qb.andWhere(new Brackets(b => {
        b.where('o.createdAt < :cts', { cts: new Date(cursor.ts) })
        .orWhere(new Brackets(bb => {
          bb.where('o.createdAt = :cts', { cts: new Date(cursor.ts) })
            .andWhere('o.id < :cid', { cid: cursor.id });
        }));
      }));
    }

    qb.orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    // --- تجميد FX للطلبات المقبولة (نقرأها دفعة واحدة)
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
          costTRY = (baseUSD * qty) * TRY_RATE;   // 👈 Manual = تحويل إلى ليرة دائمًا
        }

        sellTRY   = priceUSD * TRY_RATE;         // 👈 سعر المبيع دائمًا بالليرة
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

        quantity: o.quantity,
        priceUSD,
        sellTRY,
        costTRY,
        profitTRY,
        currencyTRY: 'TRY',

        // للعرض الجانبي إن أردت
        sellPriceAmount: priceUSD * userRate,
        sellPriceCurrency: userCode,

        fxLocked: isFrozen,
        approvedLocalDate: frozen?.approvedLocalDate ?? null,

        sentAt: o.sentAt ? o.sentAt.toISOString() : null,
        completedAt: o.completedAt ? o.completedAt.toISOString() : null,
        durationMs: (o as any).durationMs ?? null,
        createdAt: o.createdAt.toISOString(),
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

} 




