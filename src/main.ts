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
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS
const origins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.enableCors({
  origin: origins.length ? origins : ['http://localhost:3000'], // ضع دومين النكست هنا
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

  // /api prefix
  app.setGlobalPrefix('api');

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
  await app.listen(port, host);

  // اختبار اتصال DB
  const dataSource = app.get(DataSource);
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

  // طباعة المسارات
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
