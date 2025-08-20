// src/admin/catalog.admin.controller.ts
import {
  Controller, Get, Post, Put, Body, Param, Query,
  UseGuards, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';

import { CatalogProduct } from '../catalog/catalog-product.entity';
import { CatalogPackage } from '../catalog/catalog-package.entity';

// متجر المشرف
import { Product } from '../products/product.entity';
import { ProductPackage } from '../products/product-package.entity';

// العملات
import { Currency } from '../currencies/currency.entity';

function normalizePkgName(input: any): string {
  const raw = (input ?? '').toString();
  const noTags = raw.replace(/<[^>]*>/g, ' ');         // إزالة HTML
  const oneSpace = noTags.replace(/\s+/g, ' ').trim(); // مسافة واحدة
  const MAX = 100;
  const out = oneSpace.length > MAX ? oneSpace.slice(0, MAX) : oneSpace;
  return out || 'Package';
}

@Controller('admin/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
export class CatalogAdminController {
  constructor(
    @InjectRepository(CatalogProduct)  private readonly productsRepo:   Repository<CatalogProduct>,
    @InjectRepository(CatalogPackage)  private readonly packagesRepo:   Repository<CatalogPackage>,
    @InjectRepository(Product)         private readonly shopProducts:   Repository<Product>,
    @InjectRepository(ProductPackage)  private readonly shopPackages:   Repository<ProductPackage>,
    @InjectRepository(Currency)        private readonly currencyRepo:   Repository<Currency>,
  ) {}

  /* =======================
     قائمة المنتجات (عدّ الباقات اختياريًا)
     ======================= */
  @Get('products')
  async listProducts(
    @Query('q') q?: string,
    @Query('withCounts') withCounts?: string,
  ) {
    if (withCounts === '1') {
      const qb = this.productsRepo
        .createQueryBuilder('p')
        .leftJoin(CatalogPackage, 'pkg', 'pkg.catalogProductId = p.id')
        .select([
          'p.id AS id',
          'p.name AS name',
          'p.description AS description',
          'p.imageUrl AS "imageUrl"',
          'p.sourceProviderId AS "sourceProviderId"',
          'p.externalProductId AS "externalProductId"',
          'p.isActive AS "isActive"',
          'COUNT(pkg.id)::int AS "packagesCount"',
        ])
        .groupBy('p.id')
        .orderBy('p.name', 'ASC')
        .limit(500);

      if (q?.trim()) qb.where('p.name ILIKE :q', { q: `%${q.trim()}%` });

      const rows = await qb.getRawMany();
      return { items: rows };
    }

    const where = q ? { name: ILike(`%${q}%`) } : {};
    const items = await this.productsRepo.find({
      where,
      order: { name: 'ASC' },
      take: 500,
    });
    return { items };
  }

  /* =======================
     باقات منتج كتالوج واحد
     ======================= */
  @Get('products/:id/packages')
  async listPackages(@Param('id') productId: string) {
    const items = await this.packagesRepo.find({
      where: { catalogProductId: productId },
      order: { name: 'ASC' },
      take: 1000,
    });
    return { items };
  }

  /* ===========================================
     1) تفعيل كل باقات منتج كتالوج واحد في المتجر
     =========================================== */
  @Post('products/:id/enable-all')
  async enableAllForCatalogProduct(@Param('id') catalogProductId: string) {
    const catalogProduct = await this.productsRepo.findOne({ where: { id: catalogProductId } });
    if (!catalogProduct) throw new NotFoundException('Catalog product not found');

    // منتج المتجر بنفس الاسم (إن لم يوجد ننشئه)
    let shopProduct = await this.shopProducts.findOne({ where: { name: catalogProduct.name } });
    if (!shopProduct) {
      shopProduct = await this.shopProducts.save(
        this.shopProducts.create({
          name:        catalogProduct.name,
          description: (catalogProduct as any).description ?? null,
          imageUrl:    (catalogProduct as any).imageUrl ?? null,
          isActive:    true,
        } as Partial<Product>)
      );
    }
    // لو متجر بلا صورة وكتالوج عنده صورة → انسخها
    if (!shopProduct.imageUrl && (catalogProduct as any).imageUrl) {
      shopProduct.imageUrl = (catalogProduct as any).imageUrl;
      await this.shopProducts.save(shopProduct);
    }

    // باقات الكتالوج
    const cpkgs = await this.packagesRepo.find({
      where: { catalogProductId: catalogProduct.id },
      order: { name: 'ASC' },
      take: 5000,
    });

    // باقات المتجر الحالية — فهرس بالأسماء المُنقّاة
    const existingShopPkgs = await this.shopPackages.find({
      where: { product: { id: shopProduct.id } },
    });
    const byName = new Map(existingShopPkgs.map((p) => [normalizePkgName(p.name), p]));

    let created = 0;
    let skipped = 0;

    for (const c of cpkgs) {
      const cleanName = normalizePkgName((c as any).name);
      if (byName.has(cleanName)) { skipped++; continue; }

      // احترم فريدة publicCode
      let publicCode: string | null = (c as any).publicCode ?? null;
      if (publicCode) {
        const conflict = await this.shopPackages.findOne({ where: { publicCode } });
        if (conflict) publicCode = null;
      }

      const pkg = this.shopPackages.create({
        product:   shopProduct,
        name:      cleanName,
        publicCode,
        basePrice: 0,
        capital:   0,
        isActive:  true,
      } as Partial<ProductPackage>);
      await this.shopPackages.save(pkg);
      created++;
    }

    return {
      ok: true,
      productId: shopProduct.id,
      createdPackages: created,
      skippedPackages: skipped,
      totalFromCatalog: cpkgs.length,
    };
  }

  /* ===========================================
     2) تفعيل كل منتجات/باقات مزوّد في المتجر
     =========================================== */
  @Post('providers/:providerId/enable-all')
  async enableAllForProvider(@Param('providerId') providerId: string) {
    const catalogProducts = await this.productsRepo.find({
      where: { sourceProviderId: providerId },
      order: { name: 'ASC' },
      take: 5000,
    });

    let productsTouched = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalCatalogPkgs = 0;

    for (const cp of catalogProducts) {
      // منتج المتجر بنفس الاسم
      let sp = await this.shopProducts.findOne({ where: { name: cp.name } });
      if (!sp) {
        sp = await this.shopProducts.save(
          this.shopProducts.create({
            name:        cp.name,
            description: (cp as any).description ?? null,
            imageUrl:    (cp as any).imageUrl ?? null,
            isActive:    true,
          } as Partial<Product>)
        );
      }
      if (!sp.imageUrl && (cp as any).imageUrl) {
        sp.imageUrl = (cp as any).imageUrl;
        await this.shopProducts.save(sp);
      }
      productsTouched++;

      // باقات الكتالوج لهذا المنتج
      const cpkgs = await this.packagesRepo.find({
        where: { catalogProductId: cp.id },
        order: { name: 'ASC' },
        take: 5000,
      });
      totalCatalogPkgs += cpkgs.length;

      // باقات المتجر الحالية — فهرس بالأسماء المُنقّاة
      const existingShopPkgs = await this.shopPackages.find({
        where: { product: { id: sp.id } },
      });
      const byName = new Map(existingShopPkgs.map((p) => [normalizePkgName(p.name), p]));

      for (const c of cpkgs) {
        const cleanName = normalizePkgName((c as any).name);
        if (byName.has(cleanName)) { totalSkipped++; continue; }

        let publicCode: string | null = (c as any).publicCode ?? null;
        if (publicCode) {
          const conflict = await this.shopPackages.findOne({ where: { publicCode } });
          if (conflict) publicCode = null;
        }

        const pkg = this.shopPackages.create({
          product:   sp,
          name:      cleanName,
          publicCode,
          basePrice: 0,
          capital:   0,
          isActive:  true,
        } as Partial<ProductPackage>);
        await this.shopPackages.save(pkg);
        totalCreated++;
      }
    }

    return {
      ok: true,
      providerId,
      productsTouched,
      createdPackages: totalCreated,
      skippedPackages: totalSkipped,
      totalCatalogPackages: totalCatalogPkgs,
    };
  }

  /* ===========================================
     3) تحديث صور منتج الكتالوج (مع نشر للصنف بالمتجر)
     =========================================== */
  @Put('products/:id/image')
  async setCatalogProductImage(
    @Param('id') id: string,
    @Body() body: { imageUrl?: string; propagate?: boolean }
  ) {
    const p = await this.productsRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Catalog product not found');

    (p as any).imageUrl = body?.imageUrl ?? null;
    await this.productsRepo.save(p);

    if (body?.propagate) {
      const sp = await this.shopProducts.findOne({ where: { name: p.name } });
      if (sp && !sp.imageUrl && (p as any).imageUrl) {
        sp.imageUrl = (p as any).imageUrl;
        await this.shopProducts.save(sp);
      }
    }

    return { ok: true, id, imageUrl: (p as any).imageUrl ?? null };
  }

  /* ===========================================
     4) تحديث الأسعار من الكتالوج → متجر المشرف (USD حصراً)
     =========================================== */
  @Post('providers/:providerId/refresh-prices')
  async refreshPricesForProvider(
    @Param('providerId') providerId: string,
    @Body() body?: { mode?: 'copy' | 'markup'; markupPercent?: number; fixedFee?: number; overwriteZero?: boolean }
  ) {
    const mode = (body?.mode === 'markup') ? 'markup' : 'copy';
    const markupPercent = Number(body?.markupPercent ?? 0) || 0;
    const fixedFee = Number(body?.fixedFee ?? 0) || 0;
    const overwriteZero = body?.overwriteZero !== false; // افتراضي: true (اسمح بالكتابة حتى لو فيه قيمة سابقة)

    // منتجات الكتالوج لهذا المزود
    const catalogProducts = await this.productsRepo.find({
      where: { sourceProviderId: providerId },
      order: { name: 'ASC' },
      take: 10000,
    });

    // حضّر أسعار الصرف: كم دولار لكل 1 وحدة عملة (unitToUsd)
    const currencies = await this.currencyRepo.find();
    const unitToUsd: Record<string, number> = {};
    for (const c of currencies as any[]) {
      const code = (c.code ?? c.currency ?? '').toString().toUpperCase();
      if (!code) continue;

      // احتمال 1: مخزّن "كم دولار لكل 1 وحدة" (toUSD)
      const toUsd =
        Number(c.rateToUsd ?? c.usdRate ?? c.toUsd ?? 0) || 0;

      // احتمال 2: مخزّن "كم وحدة لكل 1 دولار" (perUSD)
      const perUsd =
        Number(c.perUsd ?? c.rateFromUsd ?? c.rate ?? 0) || 0;

      let k = 0;
      if (toUsd > 0) k = toUsd;            // مثال: 1 TRY = 0.03 USD
      else if (perUsd > 0) k = 1 / perUsd; // مثال: 1 USD = 33 TRY → 1 TRY = 1/33 USD

      if (k > 0) unitToUsd[code] = k;
    }
    unitToUsd['USD'] = 1;

    let updated = 0;
    let skippedNoMatch = 0;
    let skippedNoCost = 0;
    let skippedNoFx = 0;
    let totalCandidates = 0;

    // فهرس سريع: productName -> (normalizedName -> {cost,currency})
    const catalogIndexByProduct = new Map<string, Map<string, { cost?: number; currency?: string }>>();

    for (const cp of catalogProducts) {
      const cpkgs = await this.packagesRepo.find({
        where: { catalogProductId: cp.id },
        take: 10000,
      });
      const map = new Map<string, { cost?: number; currency?: string }>();
      for (const c of cpkgs as any[]) {
        const clean = normalizePkgName(c.name);
        const costRaw = (c.costPrice != null) ? String(c.costPrice) : '';
        const cost = costRaw ? Number(costRaw.replace(',', '.')) : NaN;
        const currency = (c.currencyCode ?? '').toString().toUpperCase() || 'USD';
        map.set(clean, { cost: isNaN(cost) ? undefined : cost, currency });
      }
      catalogIndexByProduct.set(cp.name, map);
    }

    // مرّ على منتجات المتجر المطابقة بالأسماء
    for (const cp of catalogProducts) {
      const sp = await this.shopProducts.findOne({ where: { name: cp.name } });
      if (!sp) continue; // لم يُفعّل هذا المنتج بعد

      const catMap = catalogIndexByProduct.get(cp.name) || new Map();

      const shopPkgs = await this.shopPackages.find({ where: { product: { id: sp.id } } });
      for (const pkg of shopPkgs as any[]) {
        totalCandidates++;

        const key = normalizePkgName(pkg.name);
        const row = catMap.get(key);
        if (!row) { skippedNoMatch++; continue; }

        if (row.cost == null || isNaN(row.cost)) { skippedNoCost++; continue; }

        const cur = (row.currency || 'USD').toUpperCase();
        const fx = unitToUsd[cur];
        if (!fx || fx <= 0) { skippedNoFx++; continue; }

        // السعر بالدولار = التكلفة × (كم دولار لكل 1 وحدة من العملة)
        let usd = row.cost * fx;

        if (mode === 'markup') {
          usd = usd * (1 + (markupPercent / 100));
          usd = usd + fixedFee;
        }

        // أمان + تقريب
        usd = Math.max(0, Number(usd.toFixed(4)));

        // لو overwriteZero=true → اكتب دائمًا
        // لو false → اكتب فقط لما basePrice الحالي = 0
        const shouldWrite = overwriteZero ? true : Number(pkg.basePrice || 0) === 0;

        if (shouldWrite) {
          pkg.basePrice = usd;
          await this.shopPackages.save(pkg);
          updated++;
        }
      }
    }

    return {
      ok: true,
      providerId,
      updated,
      skippedNoMatch,
      skippedNoCost,
      skippedNoFx,
      totalCandidates,
      mode,
      markupPercent,
      fixedFee,
    };
  }
}
