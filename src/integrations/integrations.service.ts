// src/integrations/integrations.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { NormalizedProduct } from './types';
import { BarakatProvider } from './providers/barakat.provider';
import { ZnetProvider } from './providers/znet.provider';

import { Integration } from './integration.entity';
import { PackageMapping } from './package-mapping.entity';

import { Product } from '../products/product.entity';
import { ProductPackage } from '../products/product-package.entity';
import { PackageRouting } from './package-routing.entity';
import { PackageCost } from './package-cost.entity';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly barakat: BarakatProvider,
    private readonly znet: ZnetProvider,

    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,

    @InjectRepository(PackageMapping)
    private readonly packageMappingsRepo: Repository<PackageMapping>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    @InjectRepository(ProductPackage)
    private readonly packageRepo: Repository<ProductPackage>,

    @InjectRepository(PackageRouting)
    private readonly routingRepo: Repository<PackageRouting>,

    @InjectRepository(PackageCost)
    private readonly costRepo: Repository<PackageCost>,
  ) {}

  // ===== CRUD للتكاملات =====
  async create(dto: {
    name: string;
    provider: 'barakat' | 'apstore' | 'znet';
    baseUrl?: string;
    apiToken?: string;
    kod?: string;
    sifre?: string;
  }) {
    const entity = this.integrationRepo.create(dto);
    return this.integrationRepo.save(entity);
  }

  list() {
    return this.integrationRepo.find({ order: { createdAt: 'DESC' } as any });
  }

  async get(id: string) {
    const cfg = await this.integrationRepo.findOne({ where: { id } });
    if (!cfg) throw new NotFoundException('Integration not found');
    return cfg;
  }

  // ===== اختيار الدرايفر =====
  private driverOf(cfg: Integration) {
    switch (cfg.provider) {
      case 'barakat':
      case 'apstore':
        return this.barakat;
      case 'znet':
        return this.znet;
      default:
        throw new Error(`Provider not implemented: ${cfg.provider}`);
    }
  }

  // ===== عمليات عامة =====
  async testConnection(id: string) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    return driver.getBalance(cfg);
  }

  async refreshBalance(id: string) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    const { balance } = await driver.getBalance(cfg);
    return { balance };
  }

  async syncProducts(id: string): Promise<NormalizedProduct[]> {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    return driver.listProducts(cfg);
  }

  async placeOrder(
    id: string,
    payload: { productId: string; qty: number; params: Record<string, any>; clientOrderUuid?: string },
  ) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    if (!driver.placeOrder) throw new Error('placeOrder not supported for this provider');
    return driver.placeOrder(cfg, payload);
  }

  async checkOrders(id: string, ids: string[]) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    if (!driver.checkOrders) throw new Error('checkOrders not supported for this provider');
    return driver.checkOrders(cfg, ids);
  }

  // ===== صفحة الربط حسب مزوّد واحد (موجودة سابقًا) =====
  async getIntegrationPackages(id: string, product?: string) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.product', 'product')
      .where('pkg.isActive = :active', { active: true });

    if (product && product.trim().length > 0) {
      qb.andWhere('LOWER(product.name) LIKE LOWER(:q)', { q: `%${product.trim()}%` });
    }

    qb.orderBy('product.name', 'ASC').addOrderBy('pkg.name', 'ASC');
    const ourPkgs = await qb.getMany();

    const providerData: NormalizedProduct[] = await driver.listProducts(cfg);
    const mappings = await this.packageMappingsRepo.find({ where: { provider_api_id: id } });

    const providerList = providerData.map((p) => ({ id: String(p.externalId), name: p.name }));

    const result = ourPkgs.map((pkg) => {
      const mapping = mappings.find((m) => m.our_package_id === pkg.id) || null;
      const providerPkg = providerData.find(
        (p) => String(p.externalId) === String(mapping?.provider_package_id),
      );
      const ourBase = Number(pkg.basePrice ?? 0);
      return {
        our_package_id: pkg.id,
        our_package_name: pkg.name,
        our_base_price: ourBase,
        provider_price: providerPkg?.basePrice ?? null,
        current_mapping: mapping?.provider_package_id ?? null,
        provider_packages: providerList,
      };
    });

    const { balance } = await driver.getBalance(cfg);
    return { api: { id: cfg.id, name: cfg.name, type: cfg.provider, balance }, packages: result };
  }

  async savePackageMappings(
    apiId: string,
    data: { our_package_id: string; provider_package_id: string }[],
  ) {
    await this.packageMappingsRepo.delete({ provider_api_id: apiId });
    const records = data.map((d) => ({ provider_api_id: apiId, ...d }));
    return this.packageMappingsRepo.save(records);
  }

  // ===== جديد: توجيه الباقات (عام) =====

  /** جميع الباقات مع إعدادات التوجيه والتكاليف المتاحة */
  async getRoutingAll(q?: string) {
    // جميع المزوّدين لعرضهم في القوائم
    const providers = await this.integrationRepo.find({ order: { name: 'ASC' } as any });

    // الباقات + المنتج + routing + تكاليف
    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.product', 'product')
      .leftJoinAndSelect('pkg.prices', 'prices')
      .where('pkg.isActive = true');

    if (q && q.trim()) {
      qb.andWhere(
        `(LOWER(pkg.name) LIKE LOWER(:q) OR LOWER(product.name) LIKE LOWER(:q))`,
        { q: `%${q.trim()}%` },
      );
    }

    qb.orderBy('product.name', 'ASC').addOrderBy('pkg.name', 'ASC');
    const pkgs = await qb.getMany();

    const pkgIds = pkgs.map((p) => p.id);

    const routingRows = pkgIds.length
      ? await this.routingRepo.find({
          where: { package: { id: In(pkgIds) } as any },
          relations: ['package'],
        })
      : [];

    const costRows = pkgIds.length
      ? await this.costRepo.find({
          where: { package: { id: In(pkgIds) } as any },
          relations: ['package'],
        })
      : [];

    // تجميع سريع للتكاليف حسب (packageId+providerId)
    const costKey = (pkgId: string, providerId: string) => `${pkgId}::${providerId}`;
    const costsMap = new Map<string, PackageCost>();
    costRows.forEach((c) => costsMap.set(costKey(c.package.id, c.providerId), c));

    const items = pkgs.map((p) => {
      const routing = routingRows.find((r) => r.package.id === p.id);
      const basePrice = Number(p.basePrice ?? 0);

      const providerCosts = providers.map((prov) => {
        const existing = costsMap.get(costKey(p.id, prov.id));
        return {
          providerId: prov.id,
          providerName: prov.name,
          costCurrency: (existing?.costCurrency as any) ?? 'USD',
          costAmount: Number(existing?.costAmount ?? 0),
        };
      });

      return {
        packageId: p.id,
        publicCode: (p as any).publicCode ?? null,
        productName: p.product?.name ?? '',
        packageName: p.name,
        basePrice,
        routing: {
          mode: routing?.mode ?? 'manual',
          primaryProviderId: routing?.primaryProviderId ?? null,
          fallbackProviderId: routing?.fallbackProviderId ?? null,
        },
        providers: providerCosts,
      };
    });

    return {
      providers: providers.map((p) => ({ id: p.id, name: p.name, type: p.provider })),
      items,
    };
  }

  /** حفظ فوري لحقل routing: primary|fallback.
   *  - إذا كان providerId=null => Manual
   *  - إذا يوجد أي مزوّد مختار => mode=auto وإلا manual
   */
  async setRoutingField(
    packageId: string,
    which: 'primary' | 'fallback',
    providerId: string | null,
  ) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found');

    let row = await this.routingRepo.findOne({
      where: { package: { id: pkg.id } as any },
      relations: ['package'],
    });
    if (!row) {
      row = this.routingRepo.create({ package: pkg, mode: 'manual' as any });
    }

    if (which === 'primary') row.primaryProviderId = providerId ?? null;
    else row.fallbackProviderId = providerId ?? null;

    const hasAnyProvider = !!(row.primaryProviderId || row.fallbackProviderId);
    row.mode = hasAnyProvider ? ('auto' as any) : ('manual' as any);

    await this.routingRepo.save(row);

    return {
      packageId,
      routing: {
        mode: row.mode,
        primaryProviderId: row.primaryProviderId,
        fallbackProviderId: row.fallbackProviderId,
      },
    };
  }

  /** جلب/تحديث تكلفة الباقة لدى مزوّد محدد (باستخدام mapping).
   *  - إن لم يوجد ربط -> رسالة للمستخدم ليربط الباقة في إعدادات API.
   *  - إن وُجد -> نجلب قائمة منتجات المزود، ونجد الباقة المطابقة، ونحدّث PackageCost.
   */
  async refreshProviderCost(packageId: string, providerId: string) {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId },
      relations: ['product'],
    });
    if (!pkg) throw new NotFoundException('Package not found');

    const provider = await this.integrationRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    // تحقق من وجود mapping (ربط باقتنا مع باقة المزود)
    const mapping = await this.packageMappingsRepo.findOne({
      where: {
        our_package_id: packageId,
        provider_api_id: providerId,
      },
    });
    if (!mapping) {
      return {
        packageId,
        providerId,
        mapped: false,
        message: 'لا يوجد ربط لهذه الباقة مع هذا المزود. اذهب لإعدادات API ثم اربط الباقة.',
      };
    }

    // اختر الدرايفر وصِل للأسعار
    const driver = this.driverOf(provider);

    // نجلب كل المنتجات من المزود ونبحث عن externalId الذي يطابق الربط
    const products: NormalizedProduct[] = await driver.listProducts(provider);
    const providerPkg = products.find(
      (p) => String(p.externalId) === String(mapping.provider_package_id),
    );

    if (!providerPkg) {
      return {
        packageId,
        providerId,
        mapped: true,
        message: 'تعذر إيجاد باقة المزود بناءً على الربط. تأكد من صحة الربط.',
      };
    }

    const costAmount = Number(providerPkg.basePrice ?? 0);
    const costCurrency = (providerPkg as any).currency ?? 'USD';

    // خزّن/حدّث التكلفة في قاعدة البيانات
    let row = await this.costRepo.findOne({
      where: { package: { id: packageId } as any, providerId },
      relations: ['package'],
    });
    if (!row) {
      row = this.costRepo.create({
        package: pkg,
        providerId,
        costCurrency,
        costAmount,
      });
    } else {
      row.costCurrency = costCurrency;
      row.costAmount = costAmount;
    }
    await this.costRepo.save(row);

    return {
      packageId,
      providerId,
      mapped: true,
      cost: { amount: costAmount, currency: costCurrency },
      message: 'تم تحديث تكلفة المزود لهذه الباقة.',
    };
  }
}
