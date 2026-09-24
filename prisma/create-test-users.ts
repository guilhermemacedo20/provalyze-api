import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('Teste@123', 10);

  await prisma.user.upsert({
    where: { email: 'professor@educacao.com' },
    update: { password, role: Role.TEACHER },
    create: {
      name: 'Professor Teste',
      email: 'professor@educacao.com',
      role: Role.TEACHER,
      password,
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@educacao.com' },
    update: { password, role: Role.ADMIN },
    create: {
      name: 'Admin Teste',
      email: 'admin@educacao.com',
      role: Role.ADMIN,
      password,
    },
  });

  console.log(' Usuários de teste prontos: professor@educacao.com e admin@educacao.com (senha: Teste@123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });