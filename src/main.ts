import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/pipes/validation.pipe';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
