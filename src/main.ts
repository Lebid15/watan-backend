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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
