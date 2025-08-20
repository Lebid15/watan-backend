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
import { CodeGroup } from '../codes/entities/code-group.entity';
import { CodeItem } from '../codes/entities/code-item.entity';

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

    @InjectRepository(CodeGroup)
    private readonly codeGroupRepo: Repository<CodeGroup>,
    @InjectRepository(CodeItem)
    private readonly codeItemRepo: Repository<CodeItem>,
  ) {}

  /** تطبيع إعدادات التكامل للدرايفر: إزالة null وتحويله إلى undefined */
  private toConfig(i: Integration) /*: IntegrationConfig */ {
    return {
      id: i.id,
      name: i.name,
      provider: i.provider as any,
      baseUrl: i.baseUrl ?? undefined,
      apiToken: i.apiToken ?? undefined,
      kod: i.kod ?? undefined,
      sifre: i.sifre ?? undefined,
    };
  }

  // ===== CRUD للتكاملات =====
  async create(dto: {
    name: string;
    provider: 'barakat' | 'apstore' | 'znet';
    baseUrl?: string;
    apiToken?: string;
    kod?: string;
    sifre?: string;
    scope?: 'tenant' | 'dev';
  }) {
    const entity = this.integrationRepo.create({
      scope: dto.scope ?? ('tenant' as any),
      ...dto,
    } as any);
    return this.integrationRepo.save(entity);
  }

  list(scope?: 'tenant' | 'dev') {
    const where = scope ? ({ scope } as any) : undefined;
    return this.integrationRepo.find({
      where,
      order: { createdAt: 'DESC' } as any,
    });
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
    return driver.getBalance(this.toConfig(cfg));
  }

  async refreshBalance(id: string) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    const { balance } = await driver.getBalance(this.toConfig(cfg));
    return { balance };
  }

  async syncProducts(id: string): Promise<NormalizedProduct[]> {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    return driver.listProducts(this.toConfig(cfg));
  }

  async placeOrder(
    id: string,
    payload: { productId: string; qty: number; params: Record<string, any>; clientOrderUuid?: string },
  ) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    if (!driver.placeOrder) throw new Error('placeOrder not supported for this provider');
    return driver.placeOrder(this.toConfig(cfg), payload);
  }

  async checkOrders(id: string, ids: string[]) {
    const cfg = await this.get(id);
    const driver = this.driverOf(cfg);
    if (!driver.checkOrders) throw new Error('checkOrders not supported for this provider');
    return driver.checkOrders(this.toConfig(cfg), ids);
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

    const providerData: NormalizedProduct[] = await driver.listProducts(this.toConfig(cfg));
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

    const { balance } = await driver.getBalance(this.toConfig(cfg));
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
  async getRoutingAll(q?: string) {
    // 1) جميع المزوّدين (للـ dropdown)
    const providers = await this.integrationRepo.find({ order: { name: 'ASC' } as any });

    // ⚠️ الصحيح: codeGroupRepo (مفرد)
    const groups = await this.codeGroupRepo.find({ order: { name: 'ASC' } as any });

    // 2) الباقات + المنتج + الأسعار
    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.product', 'product')
      .leftJoinAndSelect('pkg.prices', 'prices')
      .where('pkg.isActive = true');

    if (q && q.trim()) {
      qb.andWhere(
        '(LOWER(pkg.name) LIKE LOWER(:q) OR LOWER(product.name) LIKE LOWER(:q))',
        { q: `%${q.trim()}%` },
      );
    }

    qb.orderBy('product.name', 'ASC').addOrderBy('pkg.name', 'ASC');
    const pkgs = await qb.getMany();
    const pkgIds = pkgs.map((p) => p.id);

    // 3) إعدادات التوجيه + التكاليف
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

    const costKey = (pkgId: string, providerId: string) => `${pkgId}::${providerId}`;
    const costsMap = new Map<string, PackageCost>();
    costRows.forEach((c) => costsMap.set(costKey(c.package.id, c.providerId), c));

    // 4) عدد الأكواد المتاحة بكل مجموعة
    const groupIds = groups.map((g) => g.id);
    let availableByGroup = new Map<string, number>();
    if (groupIds.length) {
      const rows = await this.codeItemRepo
        .createQueryBuilder('ci')
        .select('ci.groupId', 'groupId')
        .addSelect('COUNT(*) FILTER (WHERE ci.status = :st)', 'available')
        .where('ci.groupId IN (:...ids)', { ids: groupIds, st: 'available' })
        .groupBy('ci.groupId')
        .getRawMany();
      availableByGroup = new Map(rows.map((r: any) => [String(r.groupId), Number(r.available || 0)]));
    }

    // 5) بناء العناصر
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
          providerType: routing?.providerType ?? 'manual',
          codeGroupId: routing?.codeGroupId ?? null,
        },
        providers: providerCosts,
      };
    });

    return {
      providers: providers.map((p) => ({ id: p.id, name: p.name, type: p.provider })),
      codeGroups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        available: availableByGroup.get(g.id) ?? 0,
      })),
      items,
    };
  }

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

  /** جلب/تحديث تكلفة الباقة لدى مزوّد محدد (باستخدام mapping). */
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

    const driver = this.driverOf(provider);

    // نجلب كل المنتجات من المزود ونبحث عن externalId الذي يطابق الربط
    const products: NormalizedProduct[] = await driver.listProducts(this.toConfig(provider));
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

  // حذف مزوّد + تنظيف البيانات التابعة له
  async deleteIntegration(id: string) {
    const cfg = await this.integrationRepo.findOne({ where: { id } });
    if (!cfg) throw new NotFoundException('Integration not found');

    // 1) احذف أي ربط باقات لهذا المزوّد
    await this.packageMappingsRepo.delete({ provider_api_id: id });

    // 2) احذف تكاليف هذا المزوّد (إن وُجدت)
    await this.costRepo.delete({ providerId: id });

    // 3) (لا حاجة للمساس بالـ routing لأنه مربوط بالباقة فقط، ليس بالمزوّد)

    // 4) احذف المزوّد نفسه
    await this.integrationRepo.delete(id);

    return { ok: true };
  }

  // تحديث مزود
  async updateIntegration(
    id: string,
    dto: {
      name?: string;
      provider?: 'barakat' | 'apstore' | 'znet';
      baseUrl?: string;
      apiToken?: string;
      kod?: string;
      sifre?: string;
    },
  ) {
    const cfg = await this.get(id);
    Object.assign(cfg, dto);
    return this.integrationRepo.save(cfg);
  }

  async setRoutingProviderType(packageId: string, providerType: 'manual'|'external'|'internal_codes') {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found');

    let row = await this.routingRepo.findOne({ where: { package: { id: pkg.id } as any }, relations: ['package'] });
    if (!row) row = this.routingRepo.create({ package: pkg, mode: 'manual' as any });

    row.providerType = providerType as any;

    // عند التحويل لـ manual ننظّف المزوّدين
    if (providerType === 'manual') {
      row.mode = 'manual' as any;
      row.primaryProviderId = null;
      row.fallbackProviderId = null;
      row.codeGroupId = null;
    }

    await this.routingRepo.save(row);
    return { packageId, routing: {
      mode: row.mode,
      providerType: row.providerType,
      primaryProviderId: row.primaryProviderId,
      fallbackProviderId: row.fallbackProviderId,
      codeGroupId: row.codeGroupId ?? null,
    }};
  }

  async setRoutingType(packageId: string, providerType: 'manual' | 'external' | 'internal_codes') {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found');

    let row = await this.routingRepo.findOne({ where: { package: { id: packageId } as any }, relations: ['package'] });
    if (!row) row = this.routingRepo.create({ package: pkg, mode: 'manual' as any });

    row.providerType = providerType as any;

    // لو اخترنا internal_codes ولم تُحدد مجموعة بعد، أبقي mode=manual مؤقتًا
    if (providerType === 'internal_codes') {
      row.primaryProviderId = null;
      row.fallbackProviderId = null;
      row.mode = row.codeGroupId ? ('auto' as any) : ('manual' as any);
    } else if (providerType === 'manual') {
      row.primaryProviderId = null;
      row.fallbackProviderId = null;
      row.codeGroupId = null;
      row.mode = 'manual' as any;
    } else {
      // external
      row.mode = (row.primaryProviderId || row.fallbackProviderId) ? ('auto' as any) : ('manual' as any);
      row.codeGroupId = null;
    }

    await this.routingRepo.save(row);
    return {
      packageId,
      routing: {
        mode: row.mode,
        providerType: row.providerType,
        primaryProviderId: row.primaryProviderId,
        fallbackProviderId: row.fallbackProviderId,
        codeGroupId: row.codeGroupId ?? null,
      },
    };
  }

  async setRoutingCodeGroup(packageId: string, codeGroupId: string | null) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found');

    let row = await this.routingRepo.findOne({ where: { package: { id: packageId } as any }, relations: ['package'] });
    if (!row) row = this.routingRepo.create({ package: pkg, mode: 'manual' as any });

    row.providerType = 'internal_codes' as any;
    row.codeGroupId = codeGroupId;
    row.primaryProviderId = null;
    row.fallbackProviderId = null;
    row.mode = codeGroupId ? ('auto' as any) : ('manual' as any);

    await this.routingRepo.save(row);
    return {
      packageId,
      routing: {
        mode: row.mode,
        providerType: row.providerType,
        codeGroupId: row.codeGroupId,
        primaryProviderId: null,
        fallbackProviderId: null,
      },
    };
  }
}
