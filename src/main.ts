import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/pipes/validation.pipe';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const frontUrl = process.env.FRONT_URL;
  if (!frontUrl) {
    throw new Error('FRONT_URL não definida: configure a origem do front-end.');
  }

  app.use(helmet());
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({
    origin: frontUrl.split(',').map((url) => url.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();