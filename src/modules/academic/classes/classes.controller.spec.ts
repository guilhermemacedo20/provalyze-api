import { Role } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

describe('ClassesController', () => {
  const controller = new ClassesController(
    new ClassesService(prismaMock as unknown as PrismaService, logsMock),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a class', async () => {
    prismaMock.subject.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.TEACHER,
    });
    prismaMock.class.findUnique.mockResolvedValue(null);
    prismaMock.class.create.mockResolvedValue({ id: '1' });

    const result = await controller.createClass(
      { user: { id: '1' } },
      { name: 'Turma A', subjectId: '1', teacherId: '1' },
    );

    expect(result).toEqual({ id: '1' });
    expect(prismaMock.class.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Turma A',
        subjectId: '1',
        teacherAssignments: { create: { userId: '1' } },
      }),
    });
  });
});
