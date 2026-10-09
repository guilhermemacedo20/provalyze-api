import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { ClassesService } from './classes.service';

describe('ClassesService', () => {
  const service = new ClassesService(
    prismaMock as unknown as PrismaService,
    logsMock,
  );
  const admin = { user: { id: '1', role: Role.ADMIN } };
  const teacher = { user: { id: '1', role: Role.TEACHER } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a class and assign a teacher', async () => {
    prismaMock.subject.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.TEACHER,
    });
    prismaMock.class.findUnique.mockResolvedValue(null);
    prismaMock.class.create.mockResolvedValue({ id: '1' });

    await expect(
      service.createClass(teacher, {
        name: 'Turma A',
        subjectId: '1',
        teacherId: '1',
      }),
    ).resolves.toEqual({ id: '1' });

    expect(prismaMock.class.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Turma A',
        subjectId: '1',
        teacherAssignments: { create: { userId: '1' } },
      }),
    });
  });

  it('should get a class by id', async () => {
    prismaMock.class.findUnique.mockResolvedValue({
      id: '1',
      name: 'Turma A',
      joinCode: 'abc123',
      subject: { name: 'Cálculo', course: { name: 'Engenharia' } },
      teacherAssignments: [{ teacher: { name: 'Ana' } }],
      studentAssignments: [
        { student: { id: '2', name: 'Bruno', email: 'bruno@escola.edu.br' } },
      ],
    });

    await expect(service.getClass(admin, '1')).resolves.toEqual({
      id: '1',
      name: 'Turma A',
      joinCode: 'abc123',
      teacherName: 'Ana',
      subjectName: 'Cálculo',
      courseName: 'Engenharia',
      students: [{ id: '2', name: 'Bruno', email: 'bruno@escola.edu.br' }],
    });
  });

  it('should add a student', async () => {
    prismaMock.class.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: '2',
      role: Role.STUDENT,
    });
    prismaMock.studentAssignment.findFirst.mockResolvedValue(null);
    prismaMock.studentAssignment.create.mockResolvedValue({
      id: '1',
    });

    await service.addStudent(admin, '1', '2');

    expect(prismaMock.studentAssignment.create).toHaveBeenCalledWith({
      data: { classId: '1', userId: '2' },
    });
  });

  it('should remove a student', async () => {
    prismaMock.studentAssignment.findFirst.mockResolvedValue({
      id: '1',
    });

    await service.removeStudent(admin, '1', '2');

    expect(prismaMock.studentAssignment.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { endedAt: expect.any(Date) },
    });
  });

  it('should delete a class', async () => {
    prismaMock.class.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.class.delete.mockResolvedValue({ id: '1' });

    await service.deleteClass(admin, '1');

    expect(prismaMock.class.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should not create a class when the subject does not exist', async () => {
    prismaMock.subject.findUnique.mockResolvedValue(null);

    const classCreated = service.createClass(admin, {
      name: 'Turma A',
      subjectId: '1',
      teacherId: '1',
    });

    await expect(classCreated).rejects.toBeInstanceOf(NotFoundException);
    await expect(classCreated).rejects.toThrow('Matéria não encontrada');
    expect(prismaMock.class.create).not.toHaveBeenCalled();
  });

  it.each([Role.STUDENT, Role.ADMIN, Role.COORDINATOR])(
    'should not create a class for the incompatible role',
    async (role) => {
      prismaMock.subject.findUnique.mockResolvedValue({ id: '1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: '1', role });

      const classCreated = service.createClass(admin, {
        name: 'Turma A',
        subjectId: '1',
        teacherId: '1',
      });

      await expect(classCreated).rejects.toBeInstanceOf(BadRequestException);
      await expect(classCreated).rejects.toThrow(
        'O usuário selecionado não é um professor válido',
      );
      expect(prismaMock.class.create).not.toHaveBeenCalled();
    },
  );

  it('should not add a student who is already in the class', async () => {
    prismaMock.class.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: '2',
      role: Role.STUDENT,
    });
    prismaMock.studentAssignment.findFirst.mockResolvedValue({
      id: '1',
    });

    const addedStudent = service.addStudent(admin, '1', '2');

    await expect(addedStudent).rejects.toBeInstanceOf(BadRequestException);
    await expect(addedStudent).rejects.toThrow(
      'Esse aluno já está matriculado nessa turma',
    );
    expect(prismaMock.studentAssignment.create).not.toHaveBeenCalled();
  });

  it('should show a list class', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      {
        id: '1',
        name: 'Turma A',
        joinCode: 'abc123',
        subject: { name: 'Cálculo', course: { name: 'Engenharia' } },
        teacherAssignments: [],
        studentAssignments: [],
      },
    ]);

    const classes = await service.listClasses(admin);

    expect(classes[0].teacherName).toBe('—');
    expect(classes[0].studentsCount).toBe(0);
    expect(classes[0].averageScore).toBeNull();
  });

  it('should throw when a unique join code cannot be generated', async () => {
    prismaMock.subject.findUnique.mockResolvedValue({ id: '1' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.TEACHER,
    });
    prismaMock.class.findUnique.mockResolvedValue({ id: 'taken' });

    const createdClass = service.createClass(teacher, {
      name: 'Turma A',
      subjectId: '1',
      teacherId: '1',
    });

    await expect(createdClass).rejects.toBeInstanceOf(BadRequestException);
    await expect(createdClass).rejects.toThrow(
      'Não foi possível gerar um código de acesso único. Tente novamente.',
    );
    expect(prismaMock.class.create).not.toHaveBeenCalled();
  });
});
