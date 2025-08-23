// backend/src/main.ts
// ✅ حمّل .env.local أولاً إن وجد، وإلا .env
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

(() => {
  const root = process.cwd(); // مجلد backend عند التشغيل
  const envLocal = path.resolve(root, '.env.local');
  const env = path.resolve(root, '.env');

  if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
    console.log('🟢 Loaded env from .env.local');
  } else {
    dotenv.config({ path: env });
    console.log('🟡 Loaded env from .env');
  }
})();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { User } from './user/user.entity';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Debug presence of developer bootstrap secret (length only) - remove later
  if (process.env.BOOTSTRAP_DEV_SECRET) {
    console.log('[DEBUG] BOOTSTRAP_DEV_SECRET detected (length=%d)', process.env.BOOTSTRAP_DEV_SECRET.length);
  } else {
    console.log('[DEBUG] BOOTSTRAP_DEV_SECRET NOT set');
  }
  // List all BOOTSTRAP* env var names for diagnostics (لا تطبع القيم السرية)
  try {
    const bootstrapKeys = Object.keys(process.env).filter(k => k.startsWith('BOOTSTRAP'));
    console.log('[DEBUG] BOOTSTRAP* keys =', bootstrapKeys);
  } catch {}

  // ✅ /api مرة واحدة فقط
  app.setGlobalPrefix('api');

  // ✅ CORS مضبوط للواجهة
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://watan-frontend.onrender.com',
      'http://ahmad.localhost:3000',
      'http://saeed.localhost:3000',
      // نمط عام للنطاقات الفرعية المحلية
      /^http:\/\/[a-zA-Z0-9-]+\.localhost:3000$/,
    ],
    credentials: true, // لازم true لو فيه كوكيز/جلسة
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Host', 'X-Tenant-Id'],
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Watan API')
    .setDescription('API documentation for Watan project')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';

  // ✅ احصل على DataSource قبل الاستماع لتطبيق الهجرات (مهم للإنتاج)
  const dataSource = app.get(DataSource);
  const autoMigrations = (process.env.AUTO_MIGRATIONS ?? 'true').toLowerCase() !== 'false';
  // --- Preflight structural patch: أضف أعمدة tenantId المفقودة قبل أي استعلامات تعتمدها ---
  try {
    console.log('🧪 [Preflight] Checking tenantId columns existence...');
    await dataSource.query(`
      DO $$
      BEGIN
        -- ====== Core tenant tables (create if missing) ======
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name='tenant'
        ) THEN
          CREATE TABLE "tenant" (
            "id" uuid PRIMARY KEY,
            "name" varchar(120) NOT NULL,
            "code" varchar(40) NOT NULL,
            "ownerUserId" uuid NULL,
            "isActive" boolean NOT NULL DEFAULT true,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_code_unique" ON "tenant" ("code");
          CREATE INDEX IF NOT EXISTS "idx_tenant_name" ON "tenant" ("name");
          RAISE NOTICE 'Created table tenant';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name='tenant_domain'
        ) THEN
          CREATE TABLE "tenant_domain" (
            "id" uuid PRIMARY KEY,
            "tenantId" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
            "domain" varchar(190) NOT NULL,
            "type" varchar(20) NOT NULL DEFAULT 'subdomain',
            "isPrimary" boolean NOT NULL DEFAULT false,
            "isVerified" boolean NOT NULL DEFAULT false,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS "ux_tenant_domain_domain" ON "tenant_domain" ("domain");
          RAISE NOTICE 'Created table tenant_domain';
        END IF;
        -- users.tenantId
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "users" ADD COLUMN "tenantId" uuid NULL;
      RAISE NOTICE 'Added users.tenantId';
        END IF;
        -- product_orders.tenantId
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='product_orders' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "product_orders" ADD COLUMN "tenantId" uuid NULL;
      RAISE NOTICE 'Added product_orders.tenantId';
        END IF;
        -- product.tenantId (جدول المنتجات)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='product' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "product" ADD COLUMN "tenantId" uuid NULL;
          RAISE NOTICE 'Added product.tenantId';
        END IF;
        -- product_packages.tenantId
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='product_packages' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "product_packages" ADD COLUMN "tenantId" uuid NULL;
          RAISE NOTICE 'Added product_packages.tenantId';
        END IF;
        -- price_groups.tenantId
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='price_groups' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "price_groups" ADD COLUMN "tenantId" uuid NULL;
          RAISE NOTICE 'Added price_groups.tenantId';
        END IF;
        -- package_prices.tenantId
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='package_prices' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "package_prices" ADD COLUMN "tenantId" uuid NULL;
          RAISE NOTICE 'Added package_prices.tenantId';
        END IF;
        -- package_costs.tenantId
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='package_costs' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "package_costs" ADD COLUMN "tenantId" uuid NULL;
          RAISE NOTICE 'Added package_costs.tenantId';
        END IF;
        -- order_dispatch_logs.tenantId
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='order_dispatch_logs' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "order_dispatch_logs" ADD COLUMN "tenantId" uuid NULL;
          RAISE NOTICE 'Added order_dispatch_logs.tenantId';
        END IF;
      END$$;
    `);
    const [usersHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='users' AND column_name='tenantId'`);
  const [tenantTable] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.tables WHERE table_name='tenant'`);
  const [tenantDomainTable] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.tables WHERE table_name='tenant_domain'`);
    const [ordersHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='product_orders' AND column_name='tenantId'`);
    const [productHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='product' AND column_name='tenantId'`);
    const [packagesHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='product_packages' AND column_name='tenantId'`);
    const [priceGroupsHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='price_groups' AND column_name='tenantId'`);
    const [packagePricesHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='package_prices' AND column_name='tenantId'`);
    const [packageCostsHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='package_costs' AND column_name='tenantId'`);
    const [dispatchLogsHas] = await dataSource.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='order_dispatch_logs' AND column_name='tenantId'`);
    console.log('🧪 [Preflight] Exists:', {
  tenant: tenantTable?.c === 1,
  tenant_domain: tenantDomainTable?.c === 1,
      users: usersHas?.c === 1,
      product_orders: ordersHas?.c === 1,
      product: productHas?.c === 1,
      product_packages: packagesHas?.c === 1,
      price_groups: priceGroupsHas?.c === 1,
      package_prices: packagePricesHas?.c === 1,
      package_costs: packageCostsHas?.c === 1,
      order_dispatch_logs: dispatchLogsHas?.c === 1,
    });
    // تعبئة tenantId في الطلبات إن وجد المستخدم
    await dataSource.query(`UPDATE "product_orders" o SET "tenantId" = u."tenantId" FROM "users" u WHERE o."userId" = u."id" AND o."tenantId" IS NULL;`);
    // تعبئة tenantId للـ product_packages من product
    await dataSource.query(`UPDATE "product_packages" pp SET "tenantId" = p."tenantId" FROM "product" p WHERE pp."product_id" = p."id" AND pp."tenantId" IS NULL;`);
    // محاولة تعبئة tenantId للـ product من packages (عكسيًا) إذا كان المنتج مفقود tenantId
    await dataSource.query(`UPDATE "product" p SET "tenantId" = pp."tenantId" FROM "product_packages" pp WHERE pp."product_id" = p."id" AND p."tenantId" IS NULL AND pp."tenantId" IS NOT NULL;`);
    const nullCount = await dataSource.query(`SELECT count(*)::int AS c FROM "product_orders" WHERE "tenantId" IS NULL`);
    const prodNull = await dataSource.query(`SELECT count(*)::int AS c FROM "product" WHERE "tenantId" IS NULL`);
    const pkgNull = await dataSource.query(`SELECT count(*)::int AS c FROM "product_packages" WHERE "tenantId" IS NULL`);
    const priceGroupNull = await dataSource.query(`SELECT count(*)::int AS c FROM "price_groups" WHERE "tenantId" IS NULL`);
    const packagePricesNull = await dataSource.query(`SELECT count(*)::int AS c FROM "package_prices" WHERE "tenantId" IS NULL`);
    const packageCostsNull = await dataSource.query(`SELECT count(*)::int AS c FROM "package_costs" WHERE "tenantId" IS NULL`);
    const dispatchLogsNull = await dataSource.query(`SELECT count(*)::int AS c FROM "order_dispatch_logs" WHERE "tenantId" IS NULL`);
    console.log('🧪 [Preflight] product_orders rows with tenantId NULL after fill:', nullCount[0]?.c);
    console.log('🧪 [Preflight] product rows NULL:', prodNull[0]?.c,
      '| product_packages NULL:', pkgNull[0]?.c,
      '| price_groups NULL:', priceGroupNull[0]?.c,
      '| package_prices NULL:', packagePricesNull[0]?.c,
      '| package_costs NULL:', packageCostsNull[0]?.c,
      '| dispatch_logs NULL:', dispatchLogsNull[0]?.c);
    // فهارس سريعة (إن لم تكن موجودة)
    await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_users_tenant" ON "users" ("tenantId");`);
    await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_orders_tenant" ON "product_orders" ("tenantId");`);
    await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_product_tenant" ON "product" ("tenantId");`);
    await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_product_packages_tenant" ON "product_packages" ("tenantId");`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_price_groups_tenant" ON "price_groups" ("tenantId");`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_package_prices_tenant" ON "package_prices" ("tenantId");`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_package_costs_tenant" ON "package_costs" ("tenantId");`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_order_dispatch_logs_tenant" ON "order_dispatch_logs" ("tenantId");`);
    console.log('✅ [Preflight] Tenant columns/indices ensured');
  } catch (e: any) {
    console.warn('⚠️ Preflight tenant columns patch failed (يمكن تجاهله إن وُجدت الأعمدة):', e?.message || e);
  }
  if (autoMigrations) {
    try {
      const ran = await dataSource.runMigrations();
      if (ran.length) {
        console.log(`✅ Ran ${ran.length} migration(s):`, ran.map(m => m.name));
      } else {
        console.log('ℹ️ No pending migrations');
      }
    } catch (err: any) {
      console.error('❌ Failed to run migrations automatically:', err?.message || err);
    }
  } else {
    console.log('⏭ Skipping auto migrations (AUTO_MIGRATIONS=false)');
  }

  // ================= Bootstrap Root (Instance Owner) =================
  if ((process.env.BOOTSTRAP_ENABLED || 'true').toLowerCase() === 'true') {
    try {
      const userRepo = dataSource.getRepository(User);
      // ابحث عن أي مستخدم مالك منصة حالي
      const existing = await userRepo.createQueryBuilder('u')
        .where('u.role = :role', { role: 'instance_owner' })
        .andWhere('u.tenantId IS NULL')
        .getOne();
      if (!existing) {
        const email = process.env.INITIAL_ROOT_EMAIL;
        const username = process.env.INITIAL_ROOT_USERNAME || (email ? email.split('@')[0] : 'root');
        const passwordPlain = process.env.INITIAL_ROOT_PASSWORD;
        if (!email || !passwordPlain) {
          console.warn('⚠️ Skipping root bootstrap: INITIAL_ROOT_EMAIL or INITIAL_ROOT_PASSWORD missing');
        } else {
          const hash = await bcrypt.hash(passwordPlain, 10);
          const user = userRepo.create({
            email,
            username,
            password: hash,
            role: 'instance_owner',
            tenantId: null,
            isActive: true,
            balance: 0,
          });
          await userRepo.save(user);
          console.log('✅ Bootstrap root user created:', { email, username });
        }
      } else if ((process.env.RESET_ROOT_ON_DEPLOY || 'false').toLowerCase() === 'true') {
        const passwordPlain = process.env.INITIAL_ROOT_PASSWORD;
        if (passwordPlain) {
          existing.password = await bcrypt.hash(passwordPlain, 10);
          await userRepo.save(existing);
          console.log('🔄 Root user password reset');
        } else {
          console.warn('⚠️ RESET_ROOT_ON_DEPLOY=true ولكن لا توجد INITIAL_ROOT_PASSWORD');
        }
      } else {
        // موجود بالفعل ولا إعادة ضبط
        // لا طباعة حساسة لكلمة السر
        console.log('ℹ️ Root user already exists (instance_owner).');
      }
    } catch (e: any) {
      console.error('❌ Bootstrap root user failed:', e?.message || e);
    }
  } else {
    console.log('⏭ Root bootstrap disabled (BOOTSTRAP_ENABLED=false)');
  }

  // إحصاءات عامة للمستخدمين العالميين (tenantId NULL)
  try {
    const globalRoleStats = await dataSource.query(`SELECT role, count(*) FROM users WHERE "tenantId" IS NULL GROUP BY role`);
    console.log('[BOOTSTRAP][GLOBAL-STATS] tenantId NULL counts:', globalRoleStats);
  const globalUsersSample = await dataSource.query(`SELECT email, role, "tenantId" FROM users WHERE "tenantId" IS NULL ORDER BY "createdAt" DESC LIMIT 10`);
  console.log('[BOOTSTRAP][GLOBAL-LIST] sample (max 10):', globalUsersSample);
  } catch (e:any) {
    console.warn('[BOOTSTRAP][GLOBAL-STATS] Failed to read stats:', e.message || e);
  }

  // ================= Bootstrap Developer (Global) =================
  // مفعّل افتراضياً مع BOOTSTRAP_ENABLED، ويستخدم INITIAL_DEV_EMAIL + INITIAL_DEV_PASSWORD
  // (أزيل من التشغيل التلقائي) تم تعطيل إنشاء المطوّر تلقائياً.
  // الآن الإنشاء يتم فقط عبر endpoint: POST /api/auth/bootstrap-developer
  // يمكنك حذف متغيرات INITIAL_DEV_EMAIL و INITIAL_DEV_PASSWORD و RESET_DEV_ON_DEPLOY من البيئة.

  await app.listen(port, host);

  // ✅ اختبار اتصال DB بعد الاستماع
  try {
    await dataSource.query('SELECT NOW()');
    console.log('✅ Database connected:', {
      host: process.env.DB_HOST,
      db: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
    });
  } catch (error: any) {
    console.error('❌ Database connection failed:', error?.message || error);
  }

  // ✅ طباعة المسارات المتاحة
  const httpAdapter = app.getHttpAdapter();
  const instance: any = httpAdapter.getInstance();
  const router = instance?._router;
  if (router?.stack) {
    const availableRoutes = router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        method: Object.keys(layer.route.methods)[0]?.toUpperCase() || 'GET',
        path: '/api' + layer.route.path,
      }));
    console.table(availableRoutes);
  }

  console.log(`🚀 API running on http://${host}:${port}/api`);
  console.log(`📘 Swagger at        http://${host}:${port}/api/docs`);
}

bootstrap();
