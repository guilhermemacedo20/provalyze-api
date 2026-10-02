import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { mailMock } from 'src/test/mocks/mail.mock';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthController', () => {
  const jwt = { sign: jest.fn() };
  const controller = new AuthController(
    new AuthService(
      prismaMock as unknown as PrismaService,
      jwt as unknown as JwtService,
      logsMock,
      mailMock,
    ),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should authenticate', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      name: 'Ana',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
      registrationNumber: null,
      password: 'hashedPassword',
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jwt.sign.mockReturnValue('token');

    const result = await controller.login({
      email: 'ana@escola.edu.br',
      password: 'Senha123',
    });

    expect(result.accessToken).toBe('token');
    expect(result.user.email).toBe('ana@escola.edu.br');
    
    expect(jwt.sign).toHaveBeenCalledWith({
      id: '1',
      email: 'ana@escola.edu.br',
      role: 'STUDENT',
    });
  });
});
