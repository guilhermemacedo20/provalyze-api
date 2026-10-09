import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { mailMock } from 'src/test/mocks/mail.mock';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const jwt = { sign: jest.fn() };
  const service = new AuthService(
    prismaMock as unknown as PrismaService,
    jwt as unknown as JwtService,
    logsMock,
    mailMock,
  );
  const request = { user: { id: '1', email: 'ana@escola.edu.br' } };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('should authenticate', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      name: 'Ana',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
      registrationNumber: null,
      password: 'passwordHash',
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jwt.sign.mockReturnValue('token');

    await expect(
      service.loginUser({ email: 'ana@escola.edu.br', password: 'Senha123' }),
    ).resolves.toEqual({
      accessToken: 'token',
      user: {
        id: '1',
        name: 'Ana',
        email: 'ana@escola.edu.br',
        role: 'STUDENT',
        registrationNumber: null,
      },
    });

    expect(jwt.sign).toHaveBeenCalledWith({
      id: '1',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
    });
  });

  it('should reject login with an invalid password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      password: 'hashedPassword',
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const loginUser = service.loginUser({
      email: 'ana@escola.edu.br',
      password: 'wrongPassword',
    });

    await expect(loginUser).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(loginUser).rejects.toThrow('Usuário ou senha inválidos');
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('should require a password reset when the user has no password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      password: null,
    });

    const loginUser = service.loginUser({
      email: 'ana@escola.edu.br',
      password: 'Senha123',
    });

    await expect(loginUser).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(loginUser).rejects.toThrow(
      'É necessário solicitar o reset de senha.',
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('should change the password when the current password matches', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      password: 'hash',
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jest.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);

    await expect(
      service.changePassword(request, {
        email: 'ana@escola.edu.br',
        actualPassword: 'Senha123',
        newPassword: 'Senha321',
      }),
    ).resolves.toEqual({ message: 'Senha redefinida com sucesso.' });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { password: 'new-hash' },
    });
  });

  it('should reject a password change when the current password does not match', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      password: 'hash',
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);
    jest.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);

    const changePassword = service.changePassword(request, {
      email: 'ana@escola.edu.br',
      actualPassword: 'Senha123',
      newPassword: 'Senha321',
    });

    await expect(changePassword).rejects.toBeInstanceOf(BadRequestException);
    await expect(changePassword).rejects.toThrow(
      'Não foi possível alterar a senha',
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('should return the logged user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      name: 'Ana',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
      registrationNumber: null,
    });

    await expect(
      service.me({ id: '1', email: 'ana@escola.edu.br' }),
    ).resolves.toEqual({
      id: '1',
      name: 'Ana',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
      registrationNumber: null,
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        registrationNumber: true,
        password: false,
      },
    });
  });
});
