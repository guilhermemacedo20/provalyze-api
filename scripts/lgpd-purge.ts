import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LOG_RETENTION_DAYS = 180;
const ANONYMIZED_RETENTION_YEARS = 5;

async function main() {
  const logsLimit = new Date();
  logsLimit.setDate(logsLimit.getDate() - LOG_RETENTION_DAYS);

  const usersLimit = new Date();
  usersLimit.setFullYear(usersLimit.getFullYear() - ANONYMIZED_RETENTION_YEARS);

  const logs = await prisma.auditEvent.deleteMany({
    where: { createdAt: { lt: logsLimit } },
  });

  const users = await prisma.user.findMany({
    where: {
      anonymizedAt: { lt: usersLimit },
      themes: { none: {} },
      questions: { none: {} },
      exams: { none: {} },
      pedagogicalReports: { none: {} },
    },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);

  await prisma.$transaction([
    prisma.examSession.deleteMany({ where: { userId: { in: ids } } }),
    prisma.studentAssignment.deleteMany({ where: { userId: { in: ids } } }),
    prisma.teacherAssignment.deleteMany({ where: { userId: { in: ids } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ]);

  console.log(
    `Logs com mais de ${LOG_RETENTION_DAYS} dias removidos: ${logs.count}`,
  );
  console.log(
    `Usuários anonimizados há mais de ${ANONYMIZED_RETENTION_YEARS} anos removidos: ${ids.length}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
