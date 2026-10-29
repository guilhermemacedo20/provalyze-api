import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TERMS_VERSION } from 'src/common/constants/terms';
import { cleanDatabase, createUser, loginAs } from './support/database';
import { createTestApp, mailServiceMock } from './support/test-app';

describe('Auth - integração (API + service + banco)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    mailServiceMock.sendPasswordReset.mockClear();
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
      acceptTerms: true,
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

  it('deveGravarDataEVersaoDosTermosAoRegistrar', async () => {
    // Act
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Ana Souza',
        email: 'ana@escola.edu.br',
        password: 'Senha123',
        role: 'STUDENT',
        acceptTerms: true,
      })
      .expect(201);

    // Assert
    const saved = await prisma.user.findUnique({
      where: { email: 'ana@escola.edu.br' },
    });
    expect(saved?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(saved?.termsVersion).toBe(TERMS_VERSION);
  });

  it('deveRetornar400QuandoCadastroNaoEnviaAceiteDosTermos', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Ana Souza',
        email: 'ana@escola.edu.br',
        password: 'Senha123',
        role: 'STUDENT',
      });

    // Assert
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.message)).toContain('Termos de Uso');
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('deveRetornar400QuandoCadastroEnviaAceiteDosTermosFalso', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Ana Souza',
        email: 'ana@escola.edu.br',
        password: 'Senha123',
        role: 'STUDENT',
        acceptTerms: false,
      });

    // Assert
    expect(response.status).toBe(400);
    await expect(prisma.user.count()).resolves.toBe(0);
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
        acceptTerms: true,
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
        acceptTerms: true,
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

  it('deveRetornar400QuandoCadastroPublicoTentaCriarProfessor', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Prof',
        email: 'prof@escola.edu.br',
        password: 'Senha123',
        role: 'TEACHER',
        acceptTerms: true,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Perfil de acesso não permitido');
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
        acceptTerms: true,
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
    // Arrange: cadastro público só permite STUDENT
    const register = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Bruno Lima',
        email: 'bruno@escola.edu.br',
        password: 'Senha123',
        role: 'STUDENT',
        acceptTerms: true,
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
      role: 'STUDENT',
      registrationNumber: null,
      termsAcceptedAt: expect.any(String),
      termsVersion: TERMS_VERSION,
    });
  });

  it('deveDevolverTermosNulosNoLoginDeContaCriadaPeloAdmin', async () => {
    // Arrange: conta criada direto no banco, como se fosse pelo admin
    await createUser(prisma, {
      name: 'Carla Dias',
      email: 'carla@escola.edu.br',
      role: 'TEACHER',
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'carla@escola.edu.br', password: 'Senha123' });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.user.termsAcceptedAt).toBeNull();
    expect(response.body.user.termsVersion).toBeNull();
  });

  it('deveAceitarOsTermosNoPrimeiroAcessoEPassarAVerNoPerfil', async () => {
    // Arrange
    await createUser(prisma, {
      name: 'Carla Dias',
      email: 'carla@escola.edu.br',
      role: 'TEACHER',
    });
    const token = await loginAs(app, 'carla@escola.edu.br');

    // Act
    const accept = await request(app.getHttpServer())
      .post('/api/auth/accept-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ acceptTerms: true });

    // Assert
    expect(accept.status).toBe(201);
    expect(accept.body).toEqual({
      termsAcceptedAt: expect.any(String),
      termsVersion: TERMS_VERSION,
    });

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.body.termsAcceptedAt).toBe(accept.body.termsAcceptedAt);
    expect(me.body.termsVersion).toBe(TERMS_VERSION);
  });

  it('deveManterADataOriginalQuandoOsTermosJaForamAceitos', async () => {
    // Arrange
    await createUser(prisma, {
      name: 'Carla Dias',
      email: 'carla@escola.edu.br',
      role: 'TEACHER',
    });
    const token = await loginAs(app, 'carla@escola.edu.br');
    const first = await request(app.getHttpServer())
      .post('/api/auth/accept-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ acceptTerms: true })
      .expect(201);

    // Act
    const second = await request(app.getHttpServer())
      .post('/api/auth/accept-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ acceptTerms: true });

    // Assert
    expect(second.status).toBe(201);
    expect(second.body.termsAcceptedAt).toBe(first.body.termsAcceptedAt);
  });

  it('deveRetornar400AoAceitarTermosSemEnviarAceite', async () => {
    // Arrange
    await createUser(prisma, {
      name: 'Carla Dias',
      email: 'carla@escola.edu.br',
      role: 'TEACHER',
    });
    const token = await loginAs(app, 'carla@escola.edu.br');

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/accept-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Assert
    expect(response.status).toBe(400);
    const saved = await prisma.user.findUnique({
      where: { email: 'carla@escola.edu.br' },
    });
    expect(saved?.termsAcceptedAt).toBeNull();
  });

  it('deveRetornar401AoAceitarTermosSemToken', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/auth/accept-terms')
      .send({ acceptTerms: true });

    // Assert
    expect(response.status).toBe(401);
  });

  describe('reset de senha com aceite dos termos', () => {
    // Pede o código de reset e lê o código que seria enviado por e-mail.
    async function requestResetCode(email: string): Promise<string> {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email })
        .expect(201);

      return mailServiceMock.sendPasswordReset.mock.calls[0][1] as string;
    }

    it('deveRetornar400ENaoAlterarASenhaQuandoContaSemAceiteNaoEnviaAcceptTerms', async () => {
      // Arrange: conta criada pelo admin, sem aceite
      await createUser(prisma, {
        name: 'Carla Dias',
        email: 'carla@escola.edu.br',
        role: 'TEACHER',
      });
      const code = await requestResetCode('carla@escola.edu.br');

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          email: 'carla@escola.edu.br',
          code,
          newPassword: 'NovaSenha123',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.message)).toContain('Termos de Uso');
      const saved = await prisma.user.findUnique({
        where: { email: 'carla@escola.edu.br' },
      });
      expect(saved?.termsAcceptedAt).toBeNull();
      await expect(bcrypt.compare('Senha123', saved!.password!)).resolves.toBe(
        true,
      );
    });

    it('deveGravarOAceiteQuandoContaSemAceiteRedefineASenhaComAcceptTerms', async () => {
      // Arrange
      await createUser(prisma, {
        name: 'Carla Dias',
        email: 'carla@escola.edu.br',
        role: 'TEACHER',
      });
      const code = await requestResetCode('carla@escola.edu.br');

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          email: 'carla@escola.edu.br',
          code,
          newPassword: 'NovaSenha123',
          acceptTerms: true,
        });

      // Assert
      expect(response.status).toBe(201);
      const saved = await prisma.user.findUnique({
        where: { email: 'carla@escola.edu.br' },
      });
      expect(saved?.termsAcceptedAt).toBeInstanceOf(Date);
      expect(saved?.termsVersion).toBe(TERMS_VERSION);

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'carla@escola.edu.br', password: 'NovaSenha123' });
      expect(login.status).toBe(201);
      expect(login.body.user.termsAcceptedAt).toEqual(expect.any(String));
    });

    it('devePermitirRedefinirComOMesmoCodigoDepoisDeAceitarOsTermos', async () => {
      // Arrange
      await createUser(prisma, {
        name: 'Carla Dias',
        email: 'carla@escola.edu.br',
        role: 'TEACHER',
      });
      const code = await requestResetCode('carla@escola.edu.br');
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          email: 'carla@escola.edu.br',
          code,
          newPassword: 'NovaSenha123',
        })
        .expect(400);

      // Act: o código não foi consumido pela tentativa recusada
      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          email: 'carla@escola.edu.br',
          code,
          newPassword: 'NovaSenha123',
          acceptTerms: true,
        });

      // Assert
      expect(response.status).toBe(201);
    });

    it('deveManterADataOriginalQuandoContaQueJaAceitouRedefineSemAcceptTerms', async () => {
      // Arrange: cadastro público já grava o aceite
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Ana Souza',
          email: 'ana@escola.edu.br',
          password: 'Senha123',
          role: 'STUDENT',
          acceptTerms: true,
        })
        .expect(201);
      const before = await prisma.user.findUnique({
        where: { email: 'ana@escola.edu.br' },
      });
      const code = await requestResetCode('ana@escola.edu.br');

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          email: 'ana@escola.edu.br',
          code,
          newPassword: 'NovaSenha123',
        });

      // Assert
      expect(response.status).toBe(201);
      const after = await prisma.user.findUnique({
        where: { email: 'ana@escola.edu.br' },
      });
      expect(after?.termsAcceptedAt?.toISOString()).toBe(
        before?.termsAcceptedAt?.toISOString(),
      );
    });
  });
});