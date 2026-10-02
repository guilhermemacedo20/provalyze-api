import { BadRequestException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';

describe('UsersController', () => {
  const controller = new UsersController(
    new UsersService(prismaMock as unknown as PrismaService),
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

    prismaMock.user.create.mockResolvedValue(userData);

    const result = await controller.createUser(userData);

    expect(result).toEqual(userData);
    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: userData });
  });

  it('should throw error when email already exists', async () => {
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '1',
      }),
    );

    const userExists = controller.createUser({
      name: 'Ana',
      email: 'ana@escola.edu.br',
      role: Role.STUDENT,
    });

    await expect(userExists).rejects.toBeInstanceOf(BadRequestException);
    await expect(userExists).rejects.toThrow(
      'Já existe um usuário cadastrado com esse e-mail.',
    );
    expect(prismaMock.user.create).toHaveBeenCalled();
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

    const result = await controller.listUsers();

    expect(result[0].classes).toEqual(['Turma']);
  });
});
