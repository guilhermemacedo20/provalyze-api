import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

describe('CoursesController', () => {
  const controller = new CoursesController(
    new CoursesService(prismaMock as unknown as PrismaService, logsMock),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a course', async () => {
    prismaMock.course.create.mockResolvedValue({
      id: '1',
      name: 'Engenharia',
    });

    const result = await controller.createCourse(
      { user: { id: '1' } },
      { name: 'Engenharia' },
    );

    expect(result).toEqual({ id: '1', name: 'Engenharia' });
    expect(prismaMock.course.create).toHaveBeenCalledWith({
      data: { name: 'Engenharia' },
    });
  });
});
