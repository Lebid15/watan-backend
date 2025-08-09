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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { ProductsService } from './products.service';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PriceGroup } from './price-group.entity';
import { UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

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
    @Body() body: Partial<PriceGroup>
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
    @Body() body: Partial<Product>
  ): Promise<Product> {
    return this.productsService.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.productsService.delete(id);
    return { message: 'تم حذف المنتج بنجاح' };
  }

  // =====================================
  // 🔹 الباقات (إنشاء مع رفع صورة)
  // =====================================
    // 🔹 رفع صورة المنتج
  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `product-${unique}${ext}`);
        },
      }),
    }),
  )
  async uploadProductImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new NotFoundException('لم يتم تقديم ملف');
    const imageUrl = `/uploads/${file.filename}`;
    return this.productsService.updateImage(id, imageUrl);
  }


  @Post(':id/packages')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const fileExt = extname(file.originalname);
          cb(null, `package-${uniqueSuffix}${fileExt}`);
        },
      }),
    }),
  )
  async addPackage(
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
  ): Promise<ProductPackage> {
    if (!name) throw new NotFoundException('اسم الباقة مطلوب');
    const imageUrl = file ? `/uploads/${file.filename}` : undefined;
    return this.productsService.addPackageToProduct(productId, {
      name,
      imageUrl,
    });
  }

  @Delete('packages/:id')
  async deletePackage(
    @Param('id') id: string,
  ): Promise<{ message: string }> {
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

  // ✅ المنتجات مع الأسعار بعملة المستخدم
  @UseGuards(AuthGuard('jwt'))
  @Get('user')
  async getAllForUser(@Req() req) {
    return this.productsService.findAllForUser(req.user.id);
  }

    // ✅ منتج واحد مع الأسعار بعملة المستخدم
  @UseGuards(AuthGuard('jwt'))
  @Get('user/:id')
  async getOneForUser(@Param('id') id: string, @Req() req) {
    return this.productsService.findOneForUser(id, req.user.id);
  }

}
