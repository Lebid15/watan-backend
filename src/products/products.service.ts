import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PackagePrice } from './package-price.entity';
import { PriceGroup } from './price-group.entity';
import { User } from '../user/user.entity';
import { ProductOrder } from './product-order.entity';

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
      imageUrl: data.imageUrl,      // ← إضافة imageUrl
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

  // =====================================
  // 🔹 الطلبات
  // =====================================

  async createOrder(data: { productId: string; packageId: string; quantity: number; userId: string; userIdentifier?: string }) {
    const { productId, packageId, quantity, userId, userIdentifier } = data;

    const product = await this.productsRepo.findOne({ where: { id: productId } });
    const pkg = await this.packagesRepo.findOne({ where: { id: packageId } });
    if (!product || !pkg) throw new NotFoundException('المنتج أو الباقة غير موجودة');

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const price = Number(pkg.basePrice) * quantity;
    console.log('🔍 محاولة إنشاء طلب');
    console.log(`🧾 رصيد المستخدم: ${user.balance}`);
    console.log(`🧾 سعر الباقة: ${pkg.basePrice}`);
    console.log(`🧾 الكمية المطلوبة: ${quantity}`);
    console.log(`🧾 السعر النهائي المطلوب: ${Number(pkg.basePrice) * quantity}`);
    console.log(`📌 userId المستلم: ${userId}`);
    console.log(`👤 المستخدم الذي جلب من قاعدة البيانات:`, user);


    if (Number(user.balance) < price) {
      throw new ConflictException('الرصيد غير كافٍ');
    }

    user.balance = Number(user.balance) - price;
    await this.usersRepo.save(user);

    const order = this.ordersRepo.create({
      product,
      package: pkg,
      quantity,
      price,
      status: 'pending',
      user,
      userIdentifier: userIdentifier ?? null,
    });

    return await this.ordersRepo.save(order);
  }

  async getAllOrders(status?: OrderStatus) {
    const query = this.ordersRepo.createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.package', 'package')
      .orderBy('order.createdAt', 'DESC');

    if (status) query.where('order.status = :status', { status });

    const orders = await query.getMany();

    return orders.map(order => ({
      id: order.id,
      status: order.status,
      price: order.price,
      userIdentifier: order.userIdentifier,
      createdAt: order.createdAt.toISOString(),
      userEmail: order.user?.email || 'غير معروف',
      product: { id: order.product.id, name: order.product.name },
      package: { id: order.package.id, name: order.package.name },
    }));
  }

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['user'],
    });
    if (!order) return null;

    if (status === 'rejected' && order.status !== 'rejected') {
      const user = order.user;
      user.balance = Number(user.balance) + Number(order.price);
      await this.usersRepo.save(user);
    }

    order.status = status;
    return await this.ordersRepo.save(order);
  }

  async getUserOrders(userId: string) {
    const orders = await this.ordersRepo.find({
      where: { user: { id: userId } },
      relations: ['product', 'package'],
      order: { createdAt: 'DESC' },
    });

    return orders.map(order => ({
      id: order.id,
      status: order.status,
      price: order.price,
      createdAt: order.createdAt,
      userIdentifier: order.userIdentifier ?? null,
      product: { id: order.product.id, name: order.product.name },
      package: { id: order.package.id, name: order.package.name },
    }));
  }
}
