import { INestApplication } from '@nestjs/common';
import { createValidationPipe } from 'src/common/pipes/validation.pipe';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { MailService } from 'src/infra/mail/mail.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';

export const mailServiceMock = {
  sendCreateUser: jest.fn(),
  sendPasswordReset: jest.fn(),
};

// Sobe a aplicação inteira (controllers, services, guards, Prisma) com a mesma configuração do main.ts.
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mailServiceMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}
