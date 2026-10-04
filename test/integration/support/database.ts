import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export const DEFAULT_PASSWORD = 'Senha123';

/** Apaga todos os dados do banco de teste, mantendo a estrutura. */
export async function cleanDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename::text AS tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

/** Cria um usuário diretamente no banco, com senha já criptografada. */
export async function createUser(
  prisma: PrismaClient,
  data: { name: string; email: string; role: Role; password?: string },
) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      password: await bcrypt.hash(data.password ?? DEFAULT_PASSWORD, 10),
    },
  });
}

export async function loginAs(
  app: INestApplication,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(201);

  return response.body.accessToken as string;
}