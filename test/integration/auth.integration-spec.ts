import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { cleanDatabase, createUser, loginAs } from './support/database';
import { createTestApp } from './support/test-app';

describe('Auth - integração (API + service + banco)', () => {
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

  it('deveRegistrarAlunoERetornar201SemExporASenha', async () => {
    // Arrange
    const body = {
      name: 'Ana Souza',
      email: '  Ana.Souza@Escola.edu.br ',
      password: 'Senha123',
      role: 'STUDENT',
    };

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body);

    // Assert
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        name: 'Ana Souza',
        email: 'ana.souza@escola.edu.br',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('password');

    const saved = await prisma.user.findUnique({
      where: { email: 'ana.souza@escola.edu.br' },
    });
    expect(saved?.role).toBe('STUDENT');
    expect(saved?.password).not.toBe('Senha123');
    await expect(bcrypt.compare('Senha123', saved!.password!)).resolves.toBe(
      true,
    );
  });

  it('deveRetornar409QuandoEmailJaEstaCadastrado', async () => {
    // Arrange
    await createUser(prisma, {
      name: 'Ana Souza',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Outra Ana',
        email: 'ana@escola.edu.br',
        password: 'Senha123',
        role: 'STUDENT',
      });

    // Assert
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Usuário já possui conta cadastrada');
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it('deveRetornar400ComRequisitosQuandoSenhaForFraca', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Ana Souza',
        email: 'ana@escola.edu.br',
        password: 'senha',
        role: 'STUDENT',
      });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('A senha não atende aos requisitos.');
    expect(response.body.checks).toEqual(
      expect.arrayContaining([
        { label: 'Mínimo de 8 caracteres', met: false },
        { label: 'Uma letra maiúscula', met: false },
        { label: 'Uma letra minúscula', met: true },
      ]),
    );
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('deveRetornar400QuandoCadastroPublicoTentaCriarAdmin', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Invasor',
        email: 'invasor@escola.edu.br',
        password: 'Senha123',
        role: 'ADMIN',
      });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Perfil de acesso não permitido');
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('deveRetornar401QuandoSenhaDoLoginEstiverIncorreta', async () => {
    // Arrange
    await createUser(prisma, {
      name: 'Ana Souza',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@escola.edu.br', password: 'SenhaErrada1' });

    // Assert
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Usuário ou senha inválidos');
    expect(response.body.accessToken).toBeUndefined();
  });

  it('deveRetornar401AoConsultarPerfilSemToken', async () => {
    // Act
    const response = await request(app.getHttpServer()).get('/api/auth/me');

    // Assert
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Unauthorized');
  });

  it('deveCadastrarFazerLoginEConsultarOProprioPerfilComOToken', async () => {
    // Arrange: cadastro pela API
    const register = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Bruno Lima',
        email: 'bruno@escola.edu.br',
        password: 'Senha123',
        role: 'TEACHER',
      })
      .expect(201);

    // Act: login pela API e consulta do perfil com o token recebido
    const token = await loginAs(app, 'bruno@escola.edu.br');
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: register.body.user.id,
      name: 'Bruno Lima',
      email: 'bruno@escola.edu.br',
      role: 'TEACHER',
      registrationNumber: null,
    });
  });
});