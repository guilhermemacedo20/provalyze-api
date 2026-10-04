import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { CoursesService } from './courses.service';

describe('CoursesService', () => {
  const service = new CoursesService(
    prismaMock as unknown as PrismaService,
    logsMock,
  );
  const request = { user: { id: '1', role: 'ADMIN' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a course', async () => {
    prismaMock.course.create.mockResolvedValue({
      id: '1',
      name: 'Engenharia',
    });

    await expect(
      service.createCourse(request, { name: 'Engenharia' }),
    ).resolves.toEqual({
      id: '1',
      name: 'Engenharia',
    });

    expect(prismaMock.course.create).toHaveBeenCalledWith({
      data: { name: 'Engenharia' },
    });
  });

  it('should get a course by id', async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: '1',
      name: 'Engenharia',
    });

    await expect(service.getCourse('1')).resolves.toEqual({
      id: '1',
      name: 'Engenharia',
    });

    expect(prismaMock.course.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should update a course', async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: '1',
      name: 'Engenharia',
    });
    prismaMock.course.update.mockResolvedValue({
      id: '1',
      name: 'Computação',
    });

    await expect(
      service.updateCourse(request, '1', { name: 'Computação' }),
    ).resolves.toEqual({
      id: '1',
      name: 'Computação',
    });

    expect(prismaMock.course.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'Computação' },
    });
  });

  it('should delete a course', async () => {
    prismaMock.course.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.course.delete.mockResolvedValue({ id: '1' });

    await service.deleteCourse(request, '1');

    expect(prismaMock.course.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should throw when the course does not exist', async () => {
    prismaMock.course.findUnique.mockResolvedValue(null);

    const course = service.getCourse('1');

    await expect(course).rejects.toBeInstanceOf(NotFoundException);
    await expect(course).rejects.toThrow('Curso não encontrado');
    expect(prismaMock.course.delete).not.toHaveBeenCalled();
  });

  it('should not update a course that does not exist', async () => {
    prismaMock.course.findUnique.mockResolvedValue(null);

    const updatedCourse = service.updateCourse(request, '1', {
      name: 'Computação',
    });

    await expect(updatedCourse).rejects.toBeInstanceOf(NotFoundException);
    await expect(updatedCourse).rejects.toThrow('Curso não encontrado');
    expect(prismaMock.course.update).not.toHaveBeenCalled();
  });

  it('should return an empty list when there are no courses', async () => {
    prismaMock.course.findMany.mockResolvedValue([]);

    await expect(service.listCourses()).resolves.toEqual([]);

    expect(prismaMock.course.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });
});
