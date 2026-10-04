import request from 'supertest';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { cleanDatabase, createUser, loginAs } from './support/database';
import { createTestApp } from './support/test-app';

describe('Acadêmico (cursos, matérias e turmas) - integração (API + service + banco)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await createUser(prisma, {
      name: 'Admin',
      email: 'admin@escola.edu.br',
      role: 'ADMIN',
    });
    adminToken = await loginAs(app, 'admin@escola.edu.br');
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  it('deveCriarCursoComoAdminERetornar201ComOCursoSalvo', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/courses')
      .set(auth(adminToken))
      .send({ name: 'Engenharia de Software' });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      name: 'Engenharia de Software',
      createdAt: expect.any(String),
    });
    const saved = await prisma.course.findUnique({
      where: { id: response.body.id },
    });
    expect(saved?.name).toBe('Engenharia de Software');
  });

  it('deveRetornar403QuandoAlunoTentaCriarCurso', async () => {
    // Arrange
    await createUser(prisma, {
      name: 'Aluno',
      email: 'aluno@escola.edu.br',
      role: 'STUDENT',
    });
    const studentToken = await loginAs(app, 'aluno@escola.edu.br');

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/courses')
      .set(auth(studentToken))
      .send({ name: 'Curso indevido' });

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Forbidden resource');
    await expect(prisma.course.count()).resolves.toBe(0);
  });

  it('deveRetornar400QuandoCorpoDoCursoTemCampoNaoPermitido', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/courses')
      .set(auth(adminToken))
      .send({ name: 'Engenharia de Software', ativo: true });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('property ativo should not exist');
    await expect(prisma.course.count()).resolves.toBe(0);
  });

  it('deveRetornar404AoBuscarCursoInexistente', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .get('/api/courses/id-que-nao-existe')
      .set(auth(adminToken));

    // Assert
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Curso não encontrado',
    });
  });

  it('deveRetornar404AoCriarMateriaEmCursoInexistente', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/courses/id-que-nao-existe/subjects')
      .set(auth(adminToken))
      .send({ name: 'Banco de Dados' });

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Curso não encontrado');
    await expect(prisma.subject.count()).resolves.toBe(0);
  });

  it('deveRetornar400AoCriarTurmaComUsuarioQueNaoEProfessor', async () => {
    // Arrange
    const course = await prisma.course.create({ data: { name: 'ADS' } });
    const subject = await prisma.subject.create({
      data: { name: 'Algoritmos', courseId: course.id },
    });
    const student = await createUser(prisma, {
      name: 'Aluno',
      email: 'aluno@escola.edu.br',
      role: 'STUDENT',
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Turma A', subjectId: subject.id, teacherId: student.id });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'O usuário selecionado não é um professor válido',
    );
    await expect(prisma.class.count()).resolves.toBe(0);
  });

  it('deveRetornar400AoMatricularAlunoQueJaEstaNaTurma', async () => {
    // Arrange
    const course = await prisma.course.create({ data: { name: 'ADS' } });
    const subject = await prisma.subject.create({
      data: { name: 'Algoritmos', courseId: course.id },
    });
    const schoolClass = await prisma.class.create({
      data: { name: 'Turma A', subjectId: subject.id, joinCode: 'abc12345' },
    });
    const student = await createUser(prisma, {
      name: 'Aluno',
      email: 'aluno@escola.edu.br',
      role: 'STUDENT',
    });
    await prisma.studentAssignment.create({
      data: { classId: schoolClass.id, userId: student.id },
    });

    // Act
    const response = await request(app.getHttpServer())
      .post(`/api/classes/${schoolClass.id}/students`)
      .set(auth(adminToken))
      .send({ studentId: student.id });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Esse aluno já está matriculado nessa turma',
    );
    await expect(prisma.studentAssignment.count()).resolves.toBe(1);
  });

  it('deveListarParaOProfessorApenasAsTurmasEmQueEleLeciona', async () => {
    // Arrange
    const course = await prisma.course.create({ data: { name: 'ADS' } });
    const subject = await prisma.subject.create({
      data: { name: 'Algoritmos', courseId: course.id },
    });
    const teacher = await createUser(prisma, {
      name: 'Prof. Carla',
      email: 'carla@escola.edu.br',
      role: 'TEACHER',
    });
    const otherTeacher = await createUser(prisma, {
      name: 'Prof. Davi',
      email: 'davi@escola.edu.br',
      role: 'TEACHER',
    });
    await prisma.class.create({
      data: {
        name: 'Turma da Carla',
        subjectId: subject.id,
        joinCode: 'carla001',
        teacherAssignments: { create: { userId: teacher.id } },
      },
    });
    await prisma.class.create({
      data: {
        name: 'Turma do Davi',
        subjectId: subject.id,
        joinCode: 'davi0001',
        teacherAssignments: { create: { userId: otherTeacher.id } },
      },
    });
    const teacherToken = await loginAs(app, 'carla@escola.edu.br');

    // Act
    const response = await request(app.getHttpServer())
      .get('/api/classes')
      .set(auth(teacherToken));

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      name: 'Turma da Carla',
      teacherName: 'Prof. Carla',
      subjectName: 'Algoritmos',
      courseName: 'ADS',
      studentsCount: 0,
    });
  });

  it('deveCriarCursoMateriaTurmaMatricularAlunoEConsultarATurma', async () => {
    // Arrange
    const teacher = await createUser(prisma, {
      name: 'Prof. Carla',
      email: 'carla@escola.edu.br',
      role: 'TEACHER',
    });
    const student = await createUser(prisma, {
      name: 'Aluno Eduardo',
      email: 'eduardo@escola.edu.br',
      role: 'STUDENT',
    });
    const server = app.getHttpServer();

    // Act: todo o cadastro acadêmico feito pela API
    const course = await request(server)
      .post('/api/courses')
      .set(auth(adminToken))
      .send({ name: 'Engenharia de Software' })
      .expect(201);

    const subject = await request(server)
      .post(`/api/courses/${course.body.id}/subjects`)
      .set(auth(adminToken))
      .send({ name: 'Testes de Software' })
      .expect(201);

    const schoolClass = await request(server)
      .post('/api/classes')
      .set(auth(adminToken))
      .send({
        name: 'Turma 8B',
        subjectId: subject.body.id,
        teacherId: teacher.id,
      })
      .expect(201);

    await request(server)
      .post(`/api/classes/${schoolClass.body.id}/students`)
      .set(auth(adminToken))
      .send({ studentId: student.id })
      .expect(201);

    const response = await request(server)
      .get(`/api/classes/${schoolClass.body.id}`)
      .set(auth(adminToken));

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: schoolClass.body.id,
      name: 'Turma 8B',
      joinCode: expect.stringMatching(/^[a-z0-9]{1,8}$/),
      teacherName: 'Prof. Carla',
      subjectName: 'Testes de Software',
      courseName: 'Engenharia de Software',
      students: [
        {
          id: student.id,
          name: 'Aluno Eduardo',
          email: 'eduardo@escola.edu.br',
        },
      ],
    });
  });
});