import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

describe('SubjectsController', () => {
  const controller = new SubjectsController(
    new SubjectsService(prismaMock as unknown as PrismaService, logsMock),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a subject', async () => {
    prismaMock.course.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.subject.create.mockResolvedValue({
      id: '1',
      name: 'Cálculo',
    });

    const result = await controller.createSubject({ user: { id: '1' } }, '1', {
      name: 'Cálculo',
    });

    expect(result).toEqual({ id: '1', name: 'Cálculo' });
    expect(prismaMock.subject.create).toHaveBeenCalledWith({
      data: { name: 'Cálculo', courseId: '1' },
    });
  });
});
