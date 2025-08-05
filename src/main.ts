import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // تفعيل CORS للتواصل مع الفرونت React
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  // إضافة /api لكل المسارات
  app.setGlobalPrefix('api');

  // إعداد Swagger
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
      'JWT-auth', // اسم مخصص للمخطط
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  // ✅ طباعة جميع المسارات الموجودة بعد إضافة /api
  const httpAdapter = app.getHttpAdapter();
  const instance: any = httpAdapter.getInstance();
  const router = instance._router;

  if (router?.stack) {
    const availableRoutes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        method: Object.keys(layer.route.methods)[0].toUpperCase(),
        path: '/api' + layer.route.path, // أضفنا /api يدوياً حتى يظهر واضح
      }));

    console.table(availableRoutes);
  }
}

bootstrap();
