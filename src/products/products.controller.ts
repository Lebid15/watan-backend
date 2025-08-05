import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  Delete,
  Put,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './product.entity';
import { ProductPackage } from './product-package.entity';
import { PriceGroup } from './price-group.entity';

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
  async createPriceGroup(@Body() body: Partial<PriceGroup>): Promise<PriceGroup> {
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
  // 🔹 الباقات
  // =====================================

  @Post(':id/packages')
  async addPackage(
    @Param('id') productId: string,
    @Body() body: Partial<ProductPackage>
  ): Promise<ProductPackage> {
    return this.productsService.addPackageToProduct(productId, body);
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
    body: { capital: number; prices: { groupId: string; price: number }[] }
  ) {
    return this.productsService.updatePackagePrices(packageId, body);
  }
}
