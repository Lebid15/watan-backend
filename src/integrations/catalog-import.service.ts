import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogProduct } from '../catalog/catalog-product.entity';
import { CatalogPackage } from '../catalog/catalog-package.entity';
import { Integration } from './integration.entity';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'crypto';

// واجهة عامة لسائق المزود: نحتاج دالة fetchCatalog فقط
type ExternalCatalogItem = {
  productExternalId: string;
  productName: string;
  productImageUrl?: string | null;
  packageExternalId: string;
  packageName: string;
  costPrice?: number | string | null;
  currencyCode?: string | null;
};

interface ProviderDriverLike {
  fetchCatalog?: () => Promise<ExternalCatalogItem[]>;
}

// إن احتجنا سواقات فعلية:
import { ZnetProvider } from './providers/znet.provider';
import { BarakatProvider } from './providers/barakat.provider';

@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    @InjectRepository(CatalogProduct) private readonly catalogProducts: Repository<CatalogProduct>,
    @InjectRepository(CatalogPackage) private readonly catalogPackages: Repository<CatalogPackage>,
    @InjectRepository(Integration) private readonly integrationsRepo: Repository<Integration>,
    private readonly http: HttpService,
  ) {}

  /**
   * upsert لكتالوج مزوّد خارجي إلى جداول الكتالوج
   */
  async importProvider(providerId: string) {
    const provider = await this.resolveProvider(providerId);
    const external = await this.fetchExternalCatalog(providerId);

    if (!external?.length) {
      return { createdProducts: 0, updatedProducts: 0, createdPackages: 0, updatedPackages: 0, total: 0 };
    }

    // مجمّع حسب المنتج الخارجي
    const byProductExtId = new Map<string, ExternalCatalogItem[]>();
    for (const row of external) {
      const list = byProductExtId.get(row.productExternalId) ?? [];
      list.push(row);
      byProductExtId.set(row.productExternalId, list);
    }

    let createdProducts = 0;
    let updatedProducts = 0;
    let createdPackages = 0;
    let updatedPackages = 0;

    // الموجود مسبقًا لنفس المزود
    const existingProducts = await this.catalogProducts.find({
      where: { sourceProviderId: provider.id },
    });
    const productsByExt = new Map(existingProducts.map(p => [p.externalProductId ?? '', p]));

    for (const [productExternalId, rows] of byProductExtId.entries()) {
      const first = rows[0];

      let product = productsByExt.get(productExternalId ?? '');
      if (!product) {
        product = this.catalogProducts.create({
          name: first.productName,
          description: null,
          imageUrl: first.productImageUrl ?? null,
          sourceType: 'external',
          sourceProviderId: provider.id,
          externalProductId: productExternalId,
          isActive: true,
        });
        await this.catalogProducts.save(product);
        productsByExt.set(productExternalId ?? '', product);
        createdProducts++;
      } else {
        const shouldUpdate =
          (product.name !== first.productName) ||
          (product.imageUrl ?? null) !== (first.productImageUrl ?? null);
        if (shouldUpdate) {
          product.name = first.productName;
          product.imageUrl = first.productImageUrl ?? null;
          await this.catalogProducts.save(product);
          updatedProducts++;
        }
      }

      // الحزم الخاصة بهذا المنتج
      const existingPackages = await this.catalogPackages.find({
        where: { catalogProductId: product.id, sourceProviderId: provider.id },
      });
      const pkgByExt = new Map(existingPackages.map(x => [x.externalPackageId ?? '', x]));

      for (const r of rows) {
        let pkg = pkgByExt.get(r.packageExternalId ?? '');
        if (!pkg) {
          pkg = this.catalogPackages.create({
            catalogProductId: product.id,
            name: r.packageName,
            publicCode: this.buildPublicCode(),
            sourceProviderId: provider.id,
            externalPackageId: r.packageExternalId ?? null,
            costPrice: r.costPrice != null ? String(r.costPrice) : null,
            currencyCode: r.currencyCode ?? null,
            isActive: true,
          });
          await this.catalogPackages.save(pkg);
          createdPackages++;
        } else {
          const shouldUpdate =
            (pkg.name !== r.packageName) ||
            (pkg.costPrice ?? null) !== (r.costPrice != null ? String(r.costPrice) : null) ||
            (pkg.currencyCode ?? null) !== (r.currencyCode ?? null);
          if (shouldUpdate) {
            pkg.name = r.packageName;
            pkg.costPrice = r.costPrice != null ? String(r.costPrice) : null;
            pkg.currencyCode = r.currencyCode ?? null;
            await this.catalogPackages.save(pkg);
            updatedPackages++;
          }
        }
      }
    }

    return {
      createdProducts,
      updatedProducts,
      createdPackages,
      updatedPackages,
      total: external.length,
    };
  }

  private buildPublicCode(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  }

  /** يجلب تعريف المزوّد من قاعدة البيانات مباشرة */
  private async resolveProvider(providerId: string) {
    const provider = await this.integrationsRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  /** يصنع سائق المزوّد محليًا إن لم توجد خدمة موحّدة */
  private async getDriver(providerId: string): Promise<ProviderDriverLike> {
    const provider = await this.resolveProvider(providerId);

    // ✅ اقرأ النوع الصحيح من عمود "provider"
    const type = String(
      (provider as any).provider // <-- العمود الموجود فعليًا عندك
      ?? (provider as any).type
      ?? (provider as any).providerType
      ?? ''
    ).toLowerCase();

    // ✅ جهّز الإعدادات التي قد يحتاجها السائق
    const cfg = {
      id: (provider as any).id,
      name: (provider as any).name,
      baseUrl: (provider as any).baseUrl,
      apiToken: (provider as any).apiToken,
      kod: (provider as any).kod,
      sifre: (provider as any).sifre,
    };

    let drv: any;

    if (type.includes('znet')) {
      // السائق يقبل HttpService فقط في الـ constructor
      drv = new ZnetProvider(this.http);
    } else if (type.includes('barakat') || type.includes('brkt') || type === 'barakat') {
      drv = new BarakatProvider(this.http);
    } else {
      throw new BadRequestException(`Unknown provider type for catalog fetch: "${type}"`);
    }

    // مرّر الإعدادات إن كان السائق يدعم configure()، وإلا ضعها على خاصية config
    if (drv && typeof drv.configure === 'function') {
      try { await drv.configure(cfg); } catch { /* تجاهل إن لم تكن async */ }
    } else {
      try { drv.config = cfg; } catch { /* لا شيء */ }
    }

    return drv as ProviderDriverLike;
  }

  /** يحضر الكتالوج الخارجي ويمرّر cfg إلى السائق */
  private async fetchExternalCatalog(providerId: string): Promise<ExternalCatalogItem[]> {
    const provider = await this.resolveProvider(providerId);

    const cfg = {
      id: (provider as any).id,
      name: (provider as any).name,
      baseUrl: (provider as any).baseUrl,
      apiToken: (provider as any).apiToken,
      kod: (provider as any).kod,
      sifre: (provider as any).sifre,
    };

    const driver: any = await this.getDriver(providerId);

    try {
      // 1) الأفضل: fetchCatalog(cfg) إن وُجدت
      if (driver && typeof driver.fetchCatalog === 'function') {
        const rows = await driver.fetchCatalog(cfg);
        return rows.map((r: any) => ({
          productExternalId: String(r.productExternalId),
          productName: String(r.productName),
          productImageUrl: r.productImageUrl ?? null,
          packageExternalId: String(r.packageExternalId),
          packageName: String(r.packageName),
          costPrice: r.costPrice ?? null,
          currencyCode: r.currencyCode ?? null,
        }));
      }

      // 2) بديل عام: listProducts(cfg) → تحويل لشكل الكتالوج
      if (driver && typeof driver.listProducts === 'function') {
        const items = await driver.listProducts(cfg);
        return (items ?? []).map((p: any) => {
          const meta = p?.meta ?? {};
          const productExternalId =
            (meta.oyun_bilgi_id && String(meta.oyun_bilgi_id)) ||
            (meta.game_id && String(meta.game_id)) ||
            (p.category && String(p.category)) ||
            String(p.externalId);

          const productName =
            (p.category && String(p.category)) ||
            String(p.name);

          return {
            productExternalId,
            productName,
            productImageUrl: p.imageUrl ?? null,
            packageExternalId: String(p.externalId),
            packageName: String(p.name),
            costPrice: p.basePrice ?? null,
            currencyCode: p.currencyCode ?? 'TRY',
          };
        });
      }

      throw new BadRequestException('Provider driver does not expose fetchCatalog/listProducts.');
    } catch (e: any) {
      throw new BadRequestException(
        `Catalog import failed for provider "${(provider as any).name}": ${e?.message ?? e}`
      );
    }
  }

}
