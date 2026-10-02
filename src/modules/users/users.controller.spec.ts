import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { mailMock } from 'src/test/mocks/mail.mock';

describe('UsersController', () => {
  const controller = new UsersController(
    new UsersService(prismaMock as unknown as PrismaService, mailMock),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create user when all data is valid', async () => {
    const userData = {
      id: '1',
      name: 'Ana',
      email: 'ana@escola.edu.br',
      role: Role.STUDENT,
    };

    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(userData);

    const result = await controller.createUserFromAdmin(userData);

    expect(result).toEqual(userData);
    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: userData });
  });

  it('should throw error when email already exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'ana@escola.edu.br',
    });

    const userExists = controller.createUserFromAdmin({
      name: 'Ana',
      email: 'ana@escola.edu.br',
      role: Role.STUDENT,
    });

    await expect(userExists).rejects.toBeInstanceOf(BadRequestException);
    await expect(userExists).rejects.toThrow(
      'Já existe um usuário cadastrado com esse e-mail.',
    );
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('should bring classes of professor when listing users', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: '1',
        name: 'Ana',
        email: 'ana@escola.edu.br',
        role: Role.TEACHER,
        createdAt: new Date(),
        teacherAssignments: [{ class: { name: 'Turma' } }],
        studentAssignments: [],
      },
    ]);

    const result = await controller.listUsers({
      user: { id: 'admin-1', role: Role.ADMIN },
    });

    expect(result[0].classes).toEqual(['Turma']);
  });
});
