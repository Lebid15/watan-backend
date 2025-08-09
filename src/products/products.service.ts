import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';
import { User } from '../user/user.entity';
import { ProductOrder } from './product-order.entity';
import { NotificationsService } from '../notifications/notifications.service';

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

    private readonly notifications: NotificationsService,
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
    return this.ordersRepo.manager.transaction(async (trx) => {
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

      // ✅ تحقق الرصيد مع حد السالب: totalUser <= balance + overdraftLimit
      const balance = Number(user.balance) || 0;
      const overdraft = Number(user.overdraftLimit) || 0; // مثال: 5000 يعني يُسمح حتى -5000
      if (totalUser > balance + overdraft) {
        throw new ConflictException('الرصيد غير كافٍ (تجاوز حد السالب المسموح)');
      }

      // ✅ خصم بعملة المستخدم
      user.balance = balance - totalUser;
      await usersRepo.save(user);

      // ✅ إحضار الباقة بعد التحقق
      const pkg = await packagesRepo.findOne({ where: { id: packageId } });
      if (!pkg) throw new NotFoundException('الباقة غير موجودة');

      // ✅ نخزن السعر بالدولار داخل الطلب
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

      // ✅ معلومات العرض بعملة المستخدم
      return {
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
      };
    });
  }

  // --------------------------
  async getAllOrders(status?: OrderStatus) {
    const query = this.ordersRepo.createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.currency', 'currency')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.package', 'package')
      .orderBy('order.createdAt', 'DESC');

    if (status) {
      query.where('order.status = :status', { status });
    }

    const orders = await query.getMany();

    return orders.map(order => {
      const priceUSD = Number(order.price); // المخزن بالدولار
      const unitPriceUSD = order.quantity ? priceUSD / Number(order.quantity) : priceUSD;

      const rate = order.user?.currency ? Number(order.user.currency.rate) : 1;
      const code = order.user?.currency ? order.user.currency.code : 'USD';

      const totalUser = priceUSD * rate;
      const unitUser  = unitPriceUSD * rate;

      return {
        id: order.id,
        status: order.status,
        quantity: order.quantity,

        // ✅ حقول مسطحة يسهل قراءتها في الفرونت:
        price: totalUser,                 // السعر بعملة المستخدم
        currencyCode: code,               // كود العملة
        unitPrice: unitUser,              // (اختياري) سعر الوحدة بعملة المستخدم

        // الحقول القديمة تبقى لو شيء في الفرونت يعتمد عليها
        priceUSD,
        unitPriceUSD,
        display: {
          currencyCode: code,
          unitPrice: unitUser,
          totalPrice: totalUser,
        },

        createdAt: order.createdAt.toISOString(),
        userEmail: order.user?.email || 'غير معروف',
        userIdentifier: order.userIdentifier ?? null,
        product: { id: order.product.id, name: order.product.name },
        package: { id: order.package.id, name: order.package.name },
      };
    });

  }

  // ------------------------
  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'user.currency'],
    });
    if (!order) return null;

    const prevStatus = order.status;
    const user = order.user;
    const rate = user?.currency ? Number(user.currency.rate) : 1;

    let deltaUser = 0;

    // إذا تحولت إلى مرفوض وكان الطلب سابقًا غير مرفوض → رد المبلغ
    if (status === 'rejected' && prevStatus !== 'rejected') {
      const refundUserAmount = Number(order.price) * rate; // بالدولار ← عملة المستخدم
      user.balance = Number(user.balance) + refundUserAmount;
      await this.usersRepo.save(user);
      deltaUser = refundUserAmount; // موجب = إعادة
      // إشعار شحن
      await this.notifications.walletTopup(user.id, refundUserAmount, `استرجاع مبلغ لرفض الطلب #${orderId}`);
    }

    order.status = status;
    const saved = await this.ordersRepo.save(order);

    // ✅ إشعار تغيير حالة الطلب
    await this.notifications.orderStatusChanged(
      user.id,
      saved.id,
      prevStatus as any,
      status as any,
      deltaUser || 0,
    );

    return saved;
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
      where: { user: { id: userId } },
      relations: ['product', 'package'],
      order: { createdAt: 'DESC' },
    });

    return orders.map(order => {
      const priceUSD = Number(order.price); // المخزن بالدولار
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

  // ================== أدوات مساعدة للعرض ==================
  private async getUserCurrency(userId?: string) {
    let rate = 1;
    let code = 'USD';

    if (userId) {
      const user = await this.usersRepo.findOne({
        where: { id: userId },
        relations: ['currency'],
      });
      if (user?.currency?.rate) {
        rate = Number(user.currency.rate);
        code = user.currency.code;
      }
    }
    return { rate, code };
  }

  private mapProductForUser(product: Product, rate: number) {
    const base = {
      id: product.id,
      name: product.name,
      description: (product as any)['description'] ?? null,
      imageUrl: product.imageUrl ?? null,
    };

    return {
      ...base,
      packages: product.packages.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        description: pkg.description ?? null,
        imageUrl: pkg.imageUrl ?? null,
        isActive: pkg.isActive,
        capital: Number(pkg.capital) * rate,
        basePrice: Number(pkg.basePrice ?? pkg.capital ?? 0) * rate,
        prices: (pkg.prices ?? []).map((p) => ({
          id: p.id,
          groupId: p.priceGroup.id,
          groupName: p.priceGroup.name,
          price: Number(p.price ?? 0) * rate,
        })),
      })),
    };
  }

  async findAllForUser(userId: string) {
    const { rate, code } = await this.getUserCurrency(userId);

    const products = await this.productsRepo.find({
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
      order: { name: 'ASC' },
    });

    return {
      currencyCode: code,
      items: products.map((p) => this.mapProductForUser(p, rate)),
    };
  }

  async findOneForUser(productId: string, userId: string) {
    const { rate, code } = await this.getUserCurrency(userId);

    const product = await this.productsRepo.findOne({
      where: { id: productId },
      relations: ['packages', 'packages.prices', 'packages.prices.priceGroup'],
    });
    if (!product) throw new NotFoundException('لم يتم العثور على المنتج');

    return {
      currencyCode: code,
      ...this.mapProductForUser(product, rate),
    };
  }
}
