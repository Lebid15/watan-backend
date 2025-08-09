import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ✅ تفعيل CORS للتطوير والإنتاج
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*', // السماح بأي دومين عند عدم تحديد بيئة
    credentials: true,
  });

  // ✅ إضافة /api لكل المسارات
  app.setGlobalPrefix('api');

  // ✅ إعداد Swagger
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

  // ✅ استخدم PORT من البيئة أو 3001 محليًا
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  // ✅ اختبار الاتصال بقاعدة البيانات
  const dataSource = app.get(DataSource);
  try {
    await dataSource.query('SELECT NOW()');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }

  // ✅ طباعة جميع المسارات الموجودة بعد إضافة /api
  const httpAdapter = app.getHttpAdapter();
  const instance: any = httpAdapter.getInstance();
  const router = instance._router;

  if (router?.stack) {
    const availableRoutes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        method: Object.keys(layer.route.methods)[0].toUpperCase(),
        path: '/api' + layer.route.path,
      }));

    console.table(availableRoutes);
  }
}

bootstrap();
