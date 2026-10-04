import { Prisma } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { cleanDatabase, createUser } from './support/database';
import { createTestApp } from './support/test-app';

describe('Persistência acadêmica - integração (Prisma + PostgreSQL de teste)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  it('deveSalvarERecuperarCursoComSuasMaterias', async () => {
    // Arrange
    const course = await prisma.course.create({
      data: {
        name: 'Engenharia de Software',
        subjects: { create: [{ name: 'Banco de Dados' }, { name: 'Testes' }] },
      },
    });

    // Act
    const found = await prisma.course.findUnique({
      where: { id: course.id },
      include: { subjects: { orderBy: { name: 'asc' } } },
    });

    // Assert
    expect(found?.name).toBe('Engenharia de Software');
    expect(found?.subjects.map((s) => s.name)).toEqual([
      'Banco de Dados',
      'Testes',
    ]);
    expect(found?.subjects.every((s) => s.courseId === course.id)).toBe(true);
  });

  it('deveImpedirDuasMateriasComMesmoNomeNoMesmoCurso', async () => {
    // Arrange
    const course = await prisma.course.create({ data: { name: 'ADS' } });
    await prisma.subject.create({
      data: { name: 'Algoritmos', courseId: course.id },
    });

    // Act
    const duplicate = prisma.subject.create({
      data: { name: 'Algoritmos', courseId: course.id },
    });

    // Assert
    await expect(duplicate).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    await expect(duplicate).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.subject.count()).resolves.toBe(1);
  });

  it('devePermitirMateriaComMesmoNomeEmCursosDiferentes', async () => {
    // Arrange
    const ads = await prisma.course.create({ data: { name: 'ADS' } });
    const es = await prisma.course.create({
      data: { name: 'Engenharia de Software' },
    });
    await prisma.subject.create({
      data: { name: 'Algoritmos', courseId: ads.id },
    });

    // Act
    const subject = await prisma.subject.create({
      data: { name: 'Algoritmos', courseId: es.id },
    });

    // Assert
    expect(subject.courseId).toBe(es.id);
    await expect(
      prisma.subject.count({ where: { name: 'Algoritmos' } }),
    ).resolves.toBe(2);
  });

  it('deveExcluirMateriasETurmasEmCascataAoExcluirCurso', async () => {
    // Arrange
    const course = await prisma.course.create({ data: { name: 'ADS' } });
    const subject = await prisma.subject.create({
      data: { name: 'Algoritmos', courseId: course.id },
    });
    await prisma.class.create({
      data: { name: 'Turma A', subjectId: subject.id, joinCode: 'cascade1' },
    });

    // Act
    await prisma.course.delete({ where: { id: course.id } });

    // Assert
    await expect(prisma.subject.count()).resolves.toBe(0);
    await expect(prisma.class.count()).resolves.toBe(0);
  });

  it('deveImpedirExclusaoDoUnicoAdministradorPeloTriggerDoBanco', async () => {
    // Arrange
    const admin = await createUser(prisma, {
      name: 'Admin',
      email: 'admin@escola.edu.br',
      role: 'ADMIN',
    });

    // Act
    const removeAdmin = prisma.user.delete({ where: { id: admin.id } });

    // Assert
    await expect(removeAdmin).rejects.toThrow(
      'Não é possível remover o único administrador',
    );
    await expect(
      prisma.user.count({ where: { role: 'ADMIN' } }),
    ).resolves.toBe(1);
  });
});