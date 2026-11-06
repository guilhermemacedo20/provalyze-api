import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { cleanDatabase, createUser, loginAs } from './support/database';
import { createTestApp } from './support/test-app';

describe('SubjectsController - integração (API + service + banco)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });
  const subjectsPath = (courseId: string) =>
    `/api/courses/${courseId}/subjects`;
  const buildSubjectRequest = (name: string) => ({ name });

  const criarCurso = async (name: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/courses')
      .set(auth())
      .send({ name })
      .expect(201);
    return response.body as { id: string; name: string };
  };

  const criarMateria = async (courseId: string, name: string) => {
    const response = await request(app.getHttpServer())
      .post(subjectsPath(courseId))
      .set(auth())
      .send(buildSubjectRequest(name))
      .expect(201);
    return response.body as { id: string; name: string; courseId: string };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const email = `admin-${Date.now()}@escola.edu.br`;
    await createUser(prisma, { name: 'Admin', email, role: 'ADMIN' });
    adminToken = await loginAs(app, email);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  it('criar_comCursoExistente_deveRetornar201ComMateriaDoCurso', async () => {
    // Arrange
    const course = await criarCurso(`ADS ${Date.now()}`);

    // Act
    const response = await request(app.getHttpServer())
      .post(subjectsPath(course.id))
      .set(auth())
      .send(buildSubjectRequest('Banco de Dados'));

    // Assert
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      name: 'Banco de Dados',
      courseId: course.id,
      createdAt: expect.any(String),
    });
    const saved = await prisma.subject.findUnique({
      where: { id: response.body.id },
    });
    expect(saved?.courseId).toBe(course.id);
  });

  it('listar_comMateriasEmDoisCursos_deveRetornar200SoComAsMateriasDoCurso', async () => {
    // Arrange
    const course = await criarCurso(`Engenharia de Software ${Date.now()}`);
    const otherCourse = await criarCurso(`Medicina ${Date.now()}`);
    const subject = await criarMateria(course.id, 'Algoritmos');
    await criarMateria(otherCourse.id, 'Anatomia');

    // Act
    const response = await request(app.getHttpServer())
      .get(subjectsPath(course.id))
      .set(auth());

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: subject.id,
        name: 'Algoritmos',
        courseId: course.id,
        createdAt: expect.any(String),
      },
    ]);
  });

  it('remover_comMateriaExistente_deveRetornar200EMateriaSomeDaLista', async () => {
    // Arrange
    const course = await criarCurso(`Sistemas ${Date.now()}`);
    const subject = await criarMateria(course.id, 'Redes');

    // Act
    const response = await request(app.getHttpServer())
      .delete(`${subjectsPath(course.id)}/${subject.id}`)
      .set(auth());

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(subject.id);
    const lista = await request(app.getHttpServer())
      .get(subjectsPath(course.id))
      .set(auth());
    expect(lista.body).toEqual([]);
  });

  it('criar_comNomeRepetidoNoMesmoCurso_deveRetornar409ComMensagem', async () => {
    // Arrange
    const course = await criarCurso(`Computação ${Date.now()}`);
    await criarMateria(course.id, 'Cálculo');

    // Act
    const response = await request(app.getHttpServer())
      .post(subjectsPath(course.id))
      .set(auth())
      .send(buildSubjectRequest('Cálculo'));

    // Assert
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      'Já existe uma matéria com esse nome nesse curso',
    );
    await expect(
      prisma.subject.count({ where: { courseId: course.id } }),
    ).resolves.toBe(1);
  });

  it('criar_semNome_deveRetornar400ComMensagem', async () => {
    // Arrange
    const course = await criarCurso(`Física ${Date.now()}`);

    // Act
    const response = await request(app.getHttpServer())
      .post(subjectsPath(course.id))
      .set(auth())
      .send({});

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('O campo name deve ser um texto.');
    await expect(prisma.subject.count()).resolves.toBe(0);
  });

  it('listar_comCursoInexistente_deveRetornar404ComMensagem', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .get(subjectsPath('id-inexistente'))
      .set(auth());

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Curso não encontrado');
  });

  it('remover_comMateriaDeOutroCurso_deveRetornar404EManterAMateria', async () => {
    // Arrange
    const course = await criarCurso(`Direito ${Date.now()}`);
    const otherCourse = await criarCurso(`Economia ${Date.now()}`);
    const subject = await criarMateria(otherCourse.id, 'Microeconomia');

    // Act
    const response = await request(app.getHttpServer())
      .delete(`${subjectsPath(course.id)}/${subject.id}`)
      .set(auth());

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Matéria não encontrada');
    await expect(
      prisma.subject.findUnique({ where: { id: subject.id } }),
    ).resolves.not.toBeNull();
  });
});
