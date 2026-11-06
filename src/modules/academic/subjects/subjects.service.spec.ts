import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { SubjectsService } from './subjects.service';

describe('SubjectsService', () => {
  const service = new SubjectsService(
    prismaMock as unknown as PrismaService,
    logsMock,
  );
  const request = { user: { id: '1', role: 'ADMIN' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a subject when the course exists', async () => {
    prismaMock.course.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.subject.create.mockResolvedValue({
      id: '1',
      name: 'Cálculo',
      courseId: '1',
    });

    await expect(
      service.createSubject(request, '1', { name: 'Cálculo' }),
    ).resolves.toEqual({
      id: '1',
      name: 'Cálculo',
      courseId: '1',
    });

    expect(prismaMock.subject.create).toHaveBeenCalledWith({
      data: { name: 'Cálculo', courseId: '1' },
    });
  });

  it('should list subjects of a course', async () => {
    prismaMock.course.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.subject.findMany.mockResolvedValue([
      { id: '1', name: 'Cálculo' },
    ]);

    await expect(service.listSubjects('1')).resolves.toEqual([
      { id: '1', name: 'Cálculo' },
    ]);

    expect(prismaMock.subject.findMany).toHaveBeenCalledWith({
      where: { courseId: '1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should map the course name when listing all subjects', async () => {
    prismaMock.subject.findMany.mockResolvedValue([
      {
        id: '1',
        name: 'Cálculo',
        course: { name: 'Engenharia' },
      },
    ]);

    await expect(service.listAllSubjects()).resolves.toEqual([
      { id: '1', name: 'Cálculo', courseName: 'Engenharia' },
    ]);
  });

  it('should delete a subject', async () => {
    prismaMock.course.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.subject.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.subject.delete.mockResolvedValue({ id: '1' });

    await service.deleteSubject(request, '1', '1');

    expect(prismaMock.subject.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should throw when the course does not exist', async () => {
    prismaMock.course.findUnique.mockResolvedValue(null);

    const createdSubject = service.createSubject(request, '1', {
      name: 'Cálculo',
    });

    await expect(createdSubject).rejects.toBeInstanceOf(NotFoundException);
    await expect(createdSubject).rejects.toThrow('Curso não encontrado');
    expect(prismaMock.subject.create).not.toHaveBeenCalled();
  });

  it('should not delete a subject that does not exist', async () => {
    prismaMock.course.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.subject.findFirst.mockResolvedValue(null);

    const deletedSubject = service.deleteSubject(request, '1', '1');

    await expect(deletedSubject).rejects.toBeInstanceOf(NotFoundException);
    await expect(deletedSubject).rejects.toThrow('Matéria não encontrada');
    expect(prismaMock.subject.delete).not.toHaveBeenCalled();
  });
});
