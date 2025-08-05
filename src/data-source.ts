import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Product } from './products/product.entity';
import { ProductPackage } from './products/product-package.entity';
import { PriceGroup } from './products/price-group.entity';
import { PackagePrice } from './products/package-price.entity';
import { User } from './user/user.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Asdf1212asdf.',   // ✅ كلمة مرورك الحالية
  database: 'watan',           // ✅ اسم قاعدة البيانات
  synchronize: false,          // نستخدم migrations فقط
  logging: true,
  entities: [
    User,
    Product,
    ProductPackage,
    PackagePrice,
    PriceGroup,
  ],
  migrations: ['src/migrations/*.ts'],
});
