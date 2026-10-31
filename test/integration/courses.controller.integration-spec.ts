import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import request from 'supertest';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { cleanDatabase, createUser, loginAs } from './support/database';
import { createTestApp } from './support/test-app';

describe('CoursesController - integração (HTTP real em porta aleatória)', () => {
  const BASE_PATH = '/api/courses';

  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let adminToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const client = () => request(baseUrl);
  const buildCourseRequest = (name: string) => ({ name });

  const criarCurso = async (name: string) => {
    const response = await client()
      .post(BASE_PATH)
      .set(auth(adminToken))
      .send(buildCourseRequest(name))
      .expect(201);
    return response.body as { id: string; name: string };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
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

  it('criar_comDadosValidos_deveRetornar201ComIdENomeEPersistir', async () => {
    // Arrange
    const name = `Engenharia de Software ${Date.now()}`;

    // Act
    const response = await client()
      .post(BASE_PATH)
      .set(auth(adminToken))
      .send(buildCourseRequest(name));

    // Assert
    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      id: expect.any(String),
      name,
      createdAt: expect.any(String),
    });
    const saved = await prisma.course.findUnique({
      where: { id: response.body.id },
    });
    expect(saved?.name).toBe(name);
  });

  it('listar_comCursoCriado_deveRetornar200ComOCursoNaLista', async () => {
    // Arrange
    const course = await criarCurso(`Sistemas de Informação ${Date.now()}`);

    // Act
    const response = await client().get(BASE_PATH).set(auth(adminToken));

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: course.id, name: course.name, createdAt: expect.any(String) },
    ]);
  });

  it('buscarPorId_comIdExistente_deveRetornar200ComOCurso', async () => {
    // Arrange
    const course = await criarCurso(`Ciência da Computação ${Date.now()}`);

    // Act
    const response = await client()
      .get(`${BASE_PATH}/${course.id}`)
      .set(auth(adminToken));

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: course.id,
      name: course.name,
      createdAt: expect.any(String),
    });
  });

  it('atualizar_comNomeNovo_deveRetornar200EGravarONome', async () => {
    // Arrange
    const course = await criarCurso(`ADS ${Date.now()}`);
    const newName = `Análise e Desenvolvimento ${Date.now()}`;

    // Act
    const response = await client()
      .patch(`${BASE_PATH}/${course.id}`)
      .set(auth(adminToken))
      .send(buildCourseRequest(newName));

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: course.id,
      name: newName,
      createdAt: expect.any(String),
    });
    const busca = await client()
      .get(`${BASE_PATH}/${course.id}`)
      .set(auth(adminToken));
    expect(busca.body.name).toBe(newName);
  });

  it('remover_comIdExistente_deveRetornar200ECursoDeixaDeExistir', async () => {
    // Arrange
    const course = await criarCurso(`Curso para remover ${Date.now()}`);

    // Act
    const response = await client()
      .delete(`${BASE_PATH}/${course.id}`)
      .set(auth(adminToken));

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(course.id);
    const busca = await client()
      .get(`${BASE_PATH}/${course.id}`)
      .set(auth(adminToken));
    expect(busca.status).toBe(404);
  });

  it('atualizar_comNomeDeOutroCurso_deveRetornar409ComMensagem', async () => {
    // Arrange
    const existing = await criarCurso(`Engenharia Civil ${Date.now()}`);
    const course = await criarCurso(`Engenharia Elétrica ${Date.now()}`);

    // Act
    const response = await client()
      .patch(`${BASE_PATH}/${course.id}`)
      .set(auth(adminToken))
      .send(buildCourseRequest(existing.name));

    // Assert
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Já existe um curso com esse nome');
    const saved = await prisma.course.findUnique({ where: { id: course.id } });
    expect(saved?.name).toBe(course.name);
  });

  it('atualizar_comIdInexistente_deveRetornar404ComMensagem', async () => {
    // Act
    const response = await client()
      .patch(`${BASE_PATH}/id-inexistente`)
      .set(auth(adminToken))
      .send(buildCourseRequest('Qualquer nome'));

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Curso não encontrado');
  });

  it('remover_comIdInexistente_deveRetornar404ComMensagem', async () => {
    // Act
    const response = await client()
      .delete(`${BASE_PATH}/id-inexistente`)
      .set(auth(adminToken));

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Curso não encontrado');
  });

  it('criar_semToken_deveRetornar401', async () => {
    // Act
    const response = await client()
      .post(BASE_PATH)
      .send(buildCourseRequest('Curso sem token'));

    // Assert
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Unauthorized');
    await expect(prisma.course.count()).resolves.toBe(0);
  });

  it('criar_comoAluno_deveRetornar403', async () => {
    // Arrange
    const email = `aluno-${Date.now()}@escola.edu.br`;
    await client()
      .post('/api/auth/register')
      .send({
        name: 'Aluno',
        email,
        password: 'Senha123',
        role: 'STUDENT',
        acceptTerms: true,
      })
      .expect(201);
    const studentToken = await loginAs(app, email);

    // Act
    const response = await client()
      .post(BASE_PATH)
      .set(auth(studentToken))
      .send(buildCourseRequest('Curso do aluno'));

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Forbidden resource');
    await expect(prisma.course.count()).resolves.toBe(0);
  });

  it('criar_comoCoordenador_deveRetornar201', async () => {
    // Arrange
    const email = `coordenador-${Date.now()}@escola.edu.br`;
    await createUser(prisma, {
      name: 'Coordenador',
      email,
      role: 'COORDINATOR',
    });
    const coordinatorToken = await loginAs(app, email);
    const name = `Curso do coordenador ${Date.now()}`;

    // Act
    const response = await client()
      .post(BASE_PATH)
      .set(auth(coordinatorToken))
      .send(buildCourseRequest(name));

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.name).toBe(name);
    await expect(prisma.course.count()).resolves.toBe(1);
  });
});
