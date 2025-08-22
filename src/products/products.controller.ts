// src/products/price-groups.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  Delete,
  Put,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  InternalServerErrorException,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express, Request } from 'express';
import { ProductsService } from './products.service';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PriceGroup } from './price-group.entity';
import { AuthGuard } from '@nestjs/passport';
import { configureCloudinary } from '../utils/cloudinary';


function parseMoney(input?: any): number {
  if (input == null) return 0;
  const s = String(input).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// تهيئة Cloudinary وقت الاستخدام
function getCloud() {
  return configureCloudinary();
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // =====================================
  // 🔹 مجموعات الأسعار
  // =====================================
  @Get('price-groups')
  async getPriceGroups(@Req() req: Request): Promise<PriceGroup[]> {
    // ✅ استخدم tenant context من middleware
    return this.productsService.getPriceGroups((req as any).tenant?.id || (req as any).user?.tenantId);
  }

  @Post('price-groups')
  async createPriceGroup(@Req() req: Request, @Body() body: Partial<PriceGroup>): Promise<PriceGroup> {
    // ✅ استخدم tenant context من middleware
    return this.productsService.createPriceGroup((req as any).tenant?.id || (req as any).user?.tenantId, body);
  }

  @Delete('price-groups/:id')
  async deletePriceGroup(@Req() req: Request, @Param('id') id: string) {
    // ✅ استخدم tenant context من middleware
    await this.productsService.deletePriceGroup((req as any).tenant?.id || (req as any).user?.tenantId, id);
    return { message: 'تم حذف المجموعة بنجاح' };
  }

  @Get('users-price-groups')
  async getUsersPriceGroups(@Req() req: Request) {
    // ✅ استخدم tenant context من middleware
    return this.productsService.getUsersPriceGroups((req as any).tenant?.id || (req as any).user?.tenantId);
  }

  // =====================================
  // 🔹 المنتجات
  // =====================================
  @Get()
  async findAll(@Req() req: Request): Promise<any[]> {
    // ✅ استخدم tenant context من middleware
    const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
    console.log('[PRODUCTS] findAll tenantId=', tenantId);
    const products = await this.productsService.findAllWithPackages(tenantId);
    return products.map((product) => ({
      ...product,
      packagesCount: product.packages?.length ?? 0,
    }));
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string): Promise<any> {
    // ✅ استخدم tenant context من middleware
    const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
    console.log('[PRODUCTS] findOne tenantId=', tenantId, 'productId=', id);
    const product = await this.productsService.findOneWithPackages(tenantId, id);
    if (!product) throw new NotFoundException('معرف المنتج غير صالح');
    return product;
  }

  @Post()
  async create(@Req() req: Request, @Body() body: Partial<Product>): Promise<Product> {
    // ✅ استخدم tenant context من middleware
    const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
    console.log('[PRODUCTS] create tenantId=', tenantId);
    const product = new Product();
    product.name = body.name ?? 'منتج بدون اسم';
    product.description = body.description ?? '';
    product.isActive = body.isActive ?? true;
    product.tenantId = tenantId;
    return this.productsService.create(product);
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: Partial<Product>): Promise<Product> {
    // ✅ استخدم tenant context من middleware
    const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
    console.log('[PRODUCTS] update tenantId=', tenantId, 'productId=', id);
    return this.productsService.update(tenantId, id, body);
  }

  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string): Promise<{ message: string }> {
    // ✅ استخدم tenant context من middleware
    const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
    console.log('[PRODUCTS] delete tenantId=', tenantId, 'productId=', id);
    await this.productsService.delete(tenantId, id);
    return { message: 'تم حذف المنتج بنجاح' };
  }

  // 🔹 رفع صورة المنتج إلى Cloudinary
  // =====================================
  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i.test(file.mimetype);
        if (!ok) return cb(new Error('Only image files are allowed'), false);
        cb(null, true);
      },
    }),
  )
  async uploadProductImage(@Req() req: Request, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new NotFoundException('لم يتم تقديم ملف (image)');

    try {
      const cloudinary = getCloud();
      const result: any = await new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          { folder: 'products', resource_type: 'image' },
          (error, uploadResult) => (error ? reject(error) : resolve(uploadResult)),
        );
        upload.end(file.buffer);
      });

      if (!result?.secure_url) {
        throw new Error('Cloudinary did not return secure_url');
      }
      return this.productsService.updateImage((req as any).tenant?.id || (req as any).user?.tenantId, id, result.secure_url);
    } catch (err: any) {
      console.error('[Upload Product Image] Cloudinary error:', {
        message: err?.message,
        name: err?.name,
        http_code: err?.http_code,
      });
      throw new InternalServerErrorException('فشل رفع الصورة، تحقق من إعدادات Cloudinary.');
    }
  }

  // =====================================
  // 🔹 إنشاء باقة جديدة مع رفع صورة + تمرير السعر
  // =====================================
  @Post(':id/packages')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i.test(file.mimetype);
        if (!ok) return cb(new Error('Only image files are allowed'), false);
        cb(null, true);
      },
    }),
  )
  async addPackage(
    @Req() req: Request,
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('capital') capitalStr?: string,
    @Body('basePrice') basePriceStr?: string,
    @Body('price') priceStr?: string,
  ): Promise<ProductPackage> {
    if (!name) throw new NotFoundException('اسم الباقة مطلوب');

    let imageUrl: string | undefined;
    if (file) {
      try {
        const cloudinary = getCloud();
        const result: any = await new Promise((resolve, reject) => {
          const upload = cloudinary.uploader.upload_stream(
            { folder: 'packages', resource_type: 'image' },
            (error, uploadResult) => (error ? reject(error) : resolve(uploadResult)),
          );
          upload.end(file.buffer);
        });
        imageUrl = result.secure_url;
      } catch (err: any) {
        console.error('[Add Package Image] Cloudinary error:', {
          message: err?.message,
          name: err?.name,
          http_code: err?.http_code,
        });
        throw new InternalServerErrorException('فشل رفع صورة الباقة.');
      }
    }

    const capital = parseMoney(capitalStr ?? basePriceStr ?? priceStr);

    return this.productsService.addPackageToProduct((req as any).tenant?.id || (req as any).user?.tenantId, productId, {
      name,
      imageUrl,
      capital,
    });
  }

  @Delete('packages/:id')
  async deletePackage(@Req() req: Request, @Param('id') id: string): Promise<{ message: string }> {
    // ✅ استخدم tenant context من middleware
    await this.productsService.deletePackage((req as any).tenant?.id || (req as any).user?.tenantId, id);
    return { message: 'تم حذف الباقة بنجاح' };
  }

  @Put('packages/:id/prices')
  async updatePackagePrices(
    @Req() req: Request,
    @Param('id') packageId: string,
    @Body() body: { capital: number; prices: { groupId: string; price: number }[] },
  ) {
    // ✅ استخدم tenant context من middleware
    const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
    await this.productsService.updatePackagePrices(tenantId, packageId, body);
    const rows = await this.productsService.getPackagesPricesBulk(tenantId, { packageIds: [packageId] });
    return {
      packageId,
      capital: body.capital,
      prices: rows.map(r => ({
        id: r.priceId ?? null,
        groupId: r.groupId,
        groupName: r.groupName,
        price: r.price
      })),
    };
  }

  // =====================================
  // 🔹 جلب أسعار باقات متعددة (Bulk)
  // =====================================
  @Post('packages/prices')
  async getPackagesPricesBulk(
    @Req() req: Request,
    @Body() body: { packageIds: string[]; groupId?: string },
  ) {
    return this.productsService.getPackagesPricesBulk((req as any).user?.tenantId, body);
  }

  @Get('packages/prices')
  async getPackagesPricesQuery(
    @Req() req: Request,
    @Query('packageIds') packageIds: string,
    @Query('groupId') groupId?: string,
  ) {
    if (!packageIds) throw new BadRequestException('packageIds مطلوب');

    const ids = packageIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 1000);

    return this.productsService.getPackagesPricesBulk((req as any).tenant?.id || (req as any).user?.tenantId, {
      packageIds: ids,
      groupId,
    });
  }

  // =====================================
  // 🔹 واجهات للمستخدم (JWT)
  // =====================================
  @UseGuards(AuthGuard('jwt'))
  @Get('user')
  async getAllForUser(@Req() req) {
    // ✅ استخدم tenant context من middleware
    return this.productsService.findAllForUser((req as any).tenant?.id || (req as any).user?.tenantId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('user/:id')
  async getOneForUser(@Req() req, @Param('id') id: string) {
    // ✅ استخدم tenant context من middleware
    return this.productsService.findOneForUser((req as any).tenant?.id || (req as any).user?.tenantId, id, req.user.id);
  }
}
