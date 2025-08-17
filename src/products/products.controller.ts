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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { ProductsService } from './products.service';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PriceGroup } from './price-group.entity';
import { AuthGuard } from '@nestjs/passport';
import { configureCloudinary } from '../utils/cloudinary';

// ❌ لا تنفّذ التهيئة على مستوى الملف
// const cloudinary = configureCloudinary();

// ✅ بديل: تهيئة كسولة وقت الاستخدام
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
  async getPriceGroups(): Promise<PriceGroup[]> {
    return this.productsService.getPriceGroups();
  }

  @Post('price-groups')
  async createPriceGroup(
    @Body() body: Partial<PriceGroup>,
  ): Promise<PriceGroup> {
    return this.productsService.createPriceGroup(body);
  }

  @Delete('price-groups/:id')
  async deletePriceGroup(@Param('id') id: string) {
    await this.productsService.deletePriceGroup(id);
    return { message: 'تم حذف المجموعة بنجاح' };
  }

  @Get('users-price-groups')
  async getUsersPriceGroups() {
    return this.productsService.getUsersPriceGroups();
  }

  // =====================================
  // 🔹 المنتجات
  // =====================================

  @Get()
  async findAll(): Promise<any[]> {
    const products = await this.productsService.findAllWithPackages();
    return products.map((product) => ({
      ...product,
      packagesCount: product.packages?.length ?? 0,
    }));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<any> {
    const product = await this.productsService.findOneWithPackages(id);
    if (!product) throw new NotFoundException('معرف المنتج غير صالح');
    return product;
  }

  @Post()
  async create(@Body() body: Partial<Product>): Promise<Product> {
    const product = new Product();
    product.name = body.name ?? 'منتج بدون اسم';
    product.description = body.description ?? '';
    product.isActive = body.isActive ?? true;
    return this.productsService.create(product);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<Product>,
  ): Promise<Product> {
    return this.productsService.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.productsService.delete(id);
    return { message: 'تم حذف المنتج بنجاح' };
  }

  // =====================================
  // 🔹 رفع صورة المنتج إلى Cloudinary (بدون تخزين محلي)
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
  async uploadProductImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new NotFoundException('لم يتم تقديم ملف (image)');

    try {
      const cloudinary = getCloud();
      const result: any = await new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          { folder: 'products', resource_type: 'image' },
          (error, uploadResult) => {
            if (error) return reject(error);
            return resolve(uploadResult);
          },
        );
        upload.end(file.buffer);
      });

      if (!result?.secure_url) {
        throw new Error('Cloudinary did not return secure_url');
      }
      return this.productsService.updateImage(id, result.secure_url);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[Upload Product Image] Cloudinary error:', {
        message: err?.message,
        name: err?.name,
        http_code: err?.http_code,
      });
      throw new InternalServerErrorException('فشل رفع الصورة، تحقق من إعدادات Cloudinary.');
    }
  }

  // =====================================
  // 🔹 إنشاء باقة جديدة مع رفع صورة (Cloudinary)
  // =====================================
  @Post(':id/packages')
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
  async addPackage(
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
  ): Promise<ProductPackage> {
    if (!name) throw new NotFoundException('اسم الباقة مطلوب');

    let imageUrl: string | undefined;
    if (file) {
      try {
        const cloudinary = getCloud();
        const result: any = await new Promise((resolve, reject) => {
          const upload = cloudinary.uploader.upload_stream(
            { folder: 'packages', resource_type: 'image' },
            (error, uploadResult) => {
              if (error) return reject(error);
              return resolve(uploadResult);
            },
          );
          upload.end(file.buffer);
        });
        imageUrl = result.secure_url;
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[Add Package Image] Cloudinary error:', {
          message: err?.message,
          name: err?.name,
          http_code: err?.http_code,
        });
        throw new InternalServerErrorException('فشل رفع صورة الباقة.');
      }
    }

    return this.productsService.addPackageToProduct(productId, {
      name,
      imageUrl,
    });
  }

  @Delete('packages/:id')
  async deletePackage(@Param('id') id: string): Promise<{ message: string }> {
    await this.productsService.deletePackage(id);
    return { message: 'تم حذف الباقة بنجاح' };
  }

  @Put('packages/:id/prices')
  async updatePackagePrices(
    @Param('id') packageId: string,
    @Body()
    body: { capital: number; prices: { groupId: string; price: number }[] },
  ) {
    return this.productsService.updatePackagePrices(packageId, body);
  }

  // =====================================
  // 🔹 واجهات للمستخدم (JWT)
  // =====================================

  @UseGuards(AuthGuard('jwt'))
  @Get('user')
  async getAllForUser(@Req() req) {
    return this.productsService.findAllForUser(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('user/:id')
  async getOneForUser(@Param('id') id: string, @Req() req) {
    return this.productsService.findOneForUser(id, req.user.id);
  }
}
