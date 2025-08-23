// backend/src/integrations/integrations.service.ts
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

// ثابت يستخدم لتمييز تكوينات المزودين الخاصة بالمطور (scope=dev) دون الحاجة لجعل الحقل nullable في الجدول
export const DEV_GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

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

  // ============ Helpers ============
  private toConfig(i: Integration) {
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

  private async mustGetPackageInTenant(packageId: string, tenantId: string) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, tenantId } as any, relations: ['product'] });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  private async mustGetIntegrationInTenant(id: string, tenantId: string) {
    const cfg = await this.integrationRepo.findOne({ where: { id, tenantId } as any });
    if (!cfg) throw new NotFoundException('Integration not found');
    return cfg;
  }

  private async getOrCreateRoutingForPackage(pkg: ProductPackage, tenantId: string) {
    let row = await this.routingRepo.findOne({ where: { package: { id: pkg.id } as any, tenantId } as any, relations: ['package'] });
    if (!row) {
      row = this.routingRepo.create({ package: pkg, tenantId, mode: 'manual' as any });
    }
    return row;
  }

  // ============ CRUD Integrations ============
  async create(
    tenantId: string,
    dto: {
      name: string;
      provider: 'barakat' | 'apstore' | 'znet';
      baseUrl?: string;
      apiToken?: string;
      kod?: string;
      sifre?: string;
      scope?: 'tenant' | 'dev';
    },
  ) {
    // لو scope=dev نستخدم معرف ثابت بدل تمرير '' أو null (العمود NOT NULL)
    const effectiveTenantId = dto.scope === 'dev' ? DEV_GLOBAL_TENANT_ID : tenantId;
    const entity = this.integrationRepo.create({
      tenantId: effectiveTenantId,
      scope: dto.scope ?? ('tenant' as any),
      ...dto,
    } as any);
    return this.integrationRepo.save(entity);
  }

  list(tenantId: string | null, scope?: 'tenant' | 'dev') {
    const where: any = {};
    if (tenantId === null && scope === 'dev') {
      where.tenantId = DEV_GLOBAL_TENANT_ID;
    } else if (tenantId !== null) {
      where.tenantId = tenantId;
    }
    if (scope) where.scope = scope;
    try {
      return this.integrationRepo.find({ where, order: { createdAt: 'DESC' } as any });
    } catch (e: any) {
      // إذا العمود scope غير موجود بعد (إصدار قديم في الإنتاج) تجنب 500 وأعد قائمة فارغة برسالة في اللوج
      if (e?.code === '42703') {
        console.error('[INTEGRATIONS][LIST] missing column scope -> schema drift. Please run deployment or add column manually.');
        return [] as any;
      }
      throw e;
    }
  }

  async get(id: string, tenantId: string | null) {
    const where: any = { id };
    try {
      if (tenantId === null) {
        // محاولة أولى كـ dev
        const dev = await this.integrationRepo.findOne({ where: { id, tenantId: DEV_GLOBAL_TENANT_ID } as any });
        if (dev) return dev;
      } else {
        where.tenantId = tenantId;
      }
      const cfg = await this.integrationRepo.findOne({ where });
      if (!cfg) throw new NotFoundException('Integration not found');
      return cfg;
    } catch (e: any) {
      if (e?.code === '42703') {
        console.error('[INTEGRATIONS][GET] missing column scope -> schema drift');
        throw new NotFoundException('Integration not available (schema upgrade required)');
      }
      throw e;
    }
  }

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

  // ============ Provider Ops ============
  async testConnection(id: string, tenantId: string | null) {
    const cfg = await this.get(id, tenantId);
    const driver = this.driverOf(cfg);
    return driver.getBalance(this.toConfig(cfg));
  }

  async refreshBalance(id: string, tenantId: string | null) {
    const cfg = await this.get(id, tenantId);
    const driver = this.driverOf(cfg);
    const { balance } = await driver.getBalance(this.toConfig(cfg));
    return { balance };
  }

  async syncProducts(id: string, tenantId: string | null): Promise<NormalizedProduct[]> {
    const cfg = await this.get(id, tenantId);
    const driver = this.driverOf(cfg);
    return driver.listProducts(this.toConfig(cfg));
  }

  async placeOrder(
    id: string,
    tenantId: string,
    payload: { productId: string; qty: number; params: Record<string, any>; clientOrderUuid?: string },
  ) {
    const cfg = await this.get(id, tenantId);
    const driver = this.driverOf(cfg);
    if (!driver.placeOrder) throw new Error('placeOrder not supported for this provider');
    return driver.placeOrder(this.toConfig(cfg), payload);
  }

  async checkOrders(id: string, tenantId: string, ids: string[]) {
    const cfg = await this.get(id, tenantId);
    const driver = this.driverOf(cfg);
    if (!driver.checkOrders) throw new Error('checkOrders not supported for this provider');
    return driver.checkOrders(this.toConfig(cfg), ids);
  }

  // ============ Integration Packages (mapping UI) ============
  async getIntegrationPackages(id: string, tenantId: string, product?: string) {
    const cfg = await this.get(id, tenantId);
    const driver = this.driverOf(cfg);

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.product', 'product')
      .where('pkg.isActive = :active', { active: true })
      .andWhere('pkg.tenantId = :tid', { tid: tenantId });

    if (product && product.trim().length > 0) {
      qb.andWhere('LOWER(product.name) LIKE LOWER(:q)', { q: `%${product.trim()}%` });
    }

    qb.orderBy('product.name', 'ASC').addOrderBy('pkg.name', 'ASC');
    const ourPkgs = await qb.getMany();

    const providerData: NormalizedProduct[] = await driver.listProducts(this.toConfig(cfg));
    const mappings = await this.packageMappingsRepo.find({ where: { provider_api_id: id, tenantId } as any });

    const providerList = providerData.map((p) => ({ id: String(p.externalId), name: p.name }));

    const result = ourPkgs.map((pkg) => {
      const mapping = mappings.find((m) => m.our_package_id === pkg.id) || null;
      const providerPkg = providerData.find((p) => String(p.externalId) === String(mapping?.provider_package_id));
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
    tenantId: string,
    apiId: string,
    data: { our_package_id: string; provider_package_id: string }[],
  ) {
    await this.packageMappingsRepo.delete({ provider_api_id: apiId, tenantId } as any);
    const records = data.map((d) => ({ tenantId, provider_api_id: apiId, ...d }));
    return this.packageMappingsRepo.save(records);
  }

  // ============ Routing (admin page) ============
  async getRoutingAll(tenantId: string, q?: string) {
    const providers = await this.integrationRepo.find({ where: { tenantId } as any, order: { name: 'ASC' } as any });
    const groups = await this.codeGroupRepo.find({ where: { tenantId } as any, order: { name: 'ASC' } as any });

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.product', 'product')
      .leftJoinAndSelect('pkg.prices', 'prices')
      .where('pkg.isActive = true')
      .andWhere('pkg.tenantId = :tid', { tid: tenantId });

    if (q && q.trim()) {
      qb.andWhere('(LOWER(pkg.name) LIKE LOWER(:q) OR LOWER(product.name) LIKE LOWER(:q))', { q: `%${q.trim()}%` });
    }

    qb.orderBy('product.name', 'ASC').addOrderBy('pkg.name', 'ASC');
    const pkgs = await qb.getMany();
    const pkgIds = pkgs.map((p) => p.id);

    const routingRows = pkgIds.length
      ? await this.routingRepo.find({ where: { package: { id: In(pkgIds) } as any, tenantId } as any, relations: ['package'] })
      : [];

    const costRows = pkgIds.length
      ? await this.costRepo.find({ where: { package: { id: In(pkgIds) } as any, tenantId } as any, relations: ['package'] })
      : [];

    const costKey = (pkgId: string, providerId: string) => `${pkgId}::${providerId}`;
    const costsMap = new Map<string, PackageCost>();
    costRows.forEach((c) => costsMap.set(costKey(c.package.id, c.providerId), c));

    const groupIds = groups.map((g) => g.id);
    let availableByGroup = new Map<string, number>();
    if (groupIds.length) {
      const rows = await this.codeItemRepo
        .createQueryBuilder('ci')
        .select('ci.groupId', 'groupId')
        .addSelect('COUNT(*) FILTER (WHERE ci.status = :st)', 'available')
        .where('ci.groupId IN (:...ids)', { ids: groupIds, st: 'available' })
        .andWhere('ci.tenantId = :tid', { tid: tenantId })
        .groupBy('ci.groupId')
        .getRawMany();
      availableByGroup = new Map(rows.map((r: any) => [String(r.groupId), Number(r.available || 0)]));
    }

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
      codeGroups: groups.map((g) => ({ id: g.id, name: g.name, available: availableByGroup.get(g.id) ?? 0 })),
      items,
    };
  }

  async setRoutingField(
    tenantId: string,
    packageId: string,
    which: 'primary' | 'fallback',
    providerId: string | null,
  ) {
    const pkg = await this.mustGetPackageInTenant(packageId, tenantId);

    // إن تم تعيين مزود، تأكد أنه ضمن نفس المستأجر
    if (providerId) await this.mustGetIntegrationInTenant(providerId, tenantId);

    const row = await this.getOrCreateRoutingForPackage(pkg, tenantId);

    if (which === 'primary') row.primaryProviderId = providerId ?? null;
    else row.fallbackProviderId = providerId ?? null;

    const hasAnyProvider = !!(row.primaryProviderId || row.fallbackProviderId);
    row.mode = hasAnyProvider ? ('auto' as any) : ('manual' as any);
    row.providerType = hasAnyProvider ? ('external' as any) : (row.providerType ?? ('manual' as any));
    row.codeGroupId = hasAnyProvider ? null : row.codeGroupId;

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

  /** جلب/تحديث تكلفة الباقة لدى مزوّد محدد */
  async refreshProviderCost(tenantId: string, packageId: string, providerId: string) {
    const pkg = await this.mustGetPackageInTenant(packageId, tenantId);
    const provider = await this.mustGetIntegrationInTenant(providerId, tenantId);

    // mapping ضمن نفس المستأجر
    const mapping = await this.packageMappingsRepo.findOne({
      where: { our_package_id: packageId, provider_api_id: providerId, tenantId } as any,
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
    const products: NormalizedProduct[] = await driver.listProducts(this.toConfig(provider));
    const providerPkg = products.find((p) => String(p.externalId) === String(mapping.provider_package_id));

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

    let row = await this.costRepo.findOne({
      where: { package: { id: packageId } as any, providerId, tenantId } as any,
      relations: ['package'],
    });
    if (!row) {
      row = this.costRepo.create({ tenantId, package: pkg, providerId, costCurrency, costAmount });
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

  async deleteIntegration(tenantId: string | null, id: string) {
    const cfg = await this.get(id, tenantId);

    const deleteWhere: any = { provider_api_id: id };
    if (tenantId !== null) {
      deleteWhere.tenantId = tenantId;
    }
    await this.packageMappingsRepo.delete(deleteWhere);

    const costDeleteWhere: any = { providerId: id };
    if (tenantId !== null) {
      costDeleteWhere.tenantId = tenantId;
    }
    await this.costRepo.delete(costDeleteWhere);

    const integDeleteWhere: any = { id: cfg.id };
    if (tenantId !== null) {
      integDeleteWhere.tenantId = tenantId;
    }
    await this.integrationRepo.delete(integDeleteWhere);
    return { ok: true };
  }

  async updateIntegration(
    tenantId: string | null,
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
    const cfg = await this.get(id, tenantId);
    Object.assign(cfg, dto);
    return this.integrationRepo.save(cfg);
  }

  async setRoutingProviderType(
    tenantId: string,
    packageId: string,
    providerType: 'manual' | 'external' | 'internal_codes',
  ) {
    const pkg = await this.mustGetPackageInTenant(packageId, tenantId);
    const row = await this.getOrCreateRoutingForPackage(pkg, tenantId);

    row.providerType = providerType as any;

    if (providerType === 'manual') {
      row.mode = 'manual' as any;
      row.primaryProviderId = null;
      row.fallbackProviderId = null;
      row.codeGroupId = null;
    } else if (providerType === 'internal_codes') {
      // mode يتحدد لاحقًا إذا تم اختيار مجموعة أكواد
      row.primaryProviderId = null;
      row.fallbackProviderId = null;
      row.mode = row.codeGroupId ? ('auto' as any) : ('manual' as any);
    } else {
      // external
      row.codeGroupId = null;
      row.mode = (row.primaryProviderId || row.fallbackProviderId) ? ('auto' as any) : ('manual' as any);
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

  async setRoutingType(
    tenantId: string,
    packageId: string,
    providerType: 'manual' | 'external' | 'internal_codes',
  ) {
    // Alias لنفس الدالة أعلاه للحفاظ على التوافق
    return this.setRoutingProviderType(tenantId, packageId, providerType);
  }

  async setRoutingCodeGroup(tenantId: string, packageId: string, codeGroupId: string | null) {
    const pkg = await this.mustGetPackageInTenant(packageId, tenantId);

    if (codeGroupId) {
      const cg = await this.codeGroupRepo.findOne({ where: { id: codeGroupId, tenantId } as any });
      if (!cg) throw new NotFoundException('Code group not found');
    }

    const row = await this.getOrCreateRoutingForPackage(pkg, tenantId);
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
        primaryProviderId: row.primaryProviderId ?? null,
        fallbackProviderId: row.fallbackProviderId ?? null,
      },
    };
  }
}
