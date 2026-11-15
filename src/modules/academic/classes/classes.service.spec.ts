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

    expect(classes[0].teacherName).toBe(undefined);
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

  describe('turmas ocultas do aluno', () => {
    const student = { user: { id: 's1', role: Role.STUDENT } };

    it('should mark a class as hidden for the student', async () => {
      prismaMock.studentAssignment.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.setClassHidden(student, 'c1', true),
      ).resolves.toEqual({ hidden: true });

      expect(prismaMock.studentAssignment.updateMany).toHaveBeenCalledWith({
        where: { classId: 'c1', userId: 's1', endedAt: null },
        data: { hiddenAt: expect.any(Date) },
      });
    });

    it('should unhide a class clearing hiddenAt', async () => {
      prismaMock.studentAssignment.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.setClassHidden(student, 'c1', false),
      ).resolves.toEqual({ hidden: false });

      expect(prismaMock.studentAssignment.updateMany).toHaveBeenCalledWith({
        where: { classId: 'c1', userId: 's1', endedAt: null },
        data: { hiddenAt: null },
      });
    });

    it('should throw when the student is not in the class', async () => {
      prismaMock.studentAssignment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.setClassHidden(student, 'other', true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should flag hidden classes in the student list', async () => {
      prismaMock.class.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Turma A',
          subject: { name: 'Cálculo', course: { name: 'Engenharia' } },
          teacherAssignments: [],
          studentAssignments: [{ hiddenAt: new Date() }],
        },
        {
          id: 'c2',
          name: 'Turma B',
          subject: { name: 'Física', course: { name: 'Engenharia' } },
          teacherAssignments: [],
          studentAssignments: [{ hiddenAt: null }],
        },
      ]);

      const classes = await service.listStudentClasses(student);

      expect(classes.map((c) => c.hidden)).toEqual([true, false]);
    });
  });

    describe('solicitações de entrada na turma', () => {
    const student = { user: { id: 's1', role: Role.STUDENT } };
    const ownTeacher = { user: { id: 't1', role: Role.TEACHER } };

    describe('joinClass', () => {
      it('should create a pending request instead of enrolling the student', async () => {
        prismaMock.class.findUnique.mockResolvedValue({ id: 'c1' });
        prismaMock.studentAssignment.findFirst.mockResolvedValue(null);
        prismaMock.classJoinRequest.findUnique.mockResolvedValue(null);
        prismaMock.classJoinRequest.create.mockResolvedValue({ id: 'r1' });

        await expect(service.joinClass(student, 'ABC123')).resolves.toEqual({
          status: 'PENDING',
        });

        expect(prismaMock.classJoinRequest.create).toHaveBeenCalledWith({
          data: { classId: 'c1', userId: 's1' },
        });
        expect(prismaMock.studentAssignment.create).not.toHaveBeenCalled();
      });

      it('should reject an invalid join code', async () => {
        prismaMock.class.findUnique.mockResolvedValue(null);

        await expect(
          service.joinClass(student, 'zzz'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prismaMock.classJoinRequest.create).not.toHaveBeenCalled();
      });

      it('should not accept a request from someone already in the class', async () => {
        prismaMock.class.findUnique.mockResolvedValue({ id: 'c1' });
        prismaMock.studentAssignment.findFirst.mockResolvedValue({ id: 'a1' });

        const joined = service.joinClass(student, 'abc123');

        await expect(joined).rejects.toBeInstanceOf(BadRequestException);
        await expect(joined).rejects.toThrow('Você já está nessa sala');
        expect(prismaMock.classJoinRequest.create).not.toHaveBeenCalled();
      });

      it('should not duplicate a request that is still pending', async () => {
        prismaMock.class.findUnique.mockResolvedValue({ id: 'c1' });
        prismaMock.studentAssignment.findFirst.mockResolvedValue(null);
        prismaMock.classJoinRequest.findUnique.mockResolvedValue({
          id: 'r1',
          status: 'PENDING',
        });

        const joined = service.joinClass(student, 'abc123');

        await expect(joined).rejects.toBeInstanceOf(BadRequestException);
        await expect(joined).rejects.toThrow(
          'Você já solicitou entrada nessa turma. Aguarde a aprovação do professor.',
        );
        expect(prismaMock.classJoinRequest.create).not.toHaveBeenCalled();
        expect(prismaMock.classJoinRequest.update).not.toHaveBeenCalled();
      });

      it('should reopen a rejected request as pending', async () => {
        prismaMock.class.findUnique.mockResolvedValue({ id: 'c1' });
        prismaMock.studentAssignment.findFirst.mockResolvedValue(null);
        prismaMock.classJoinRequest.findUnique.mockResolvedValue({
          id: 'r1',
          status: 'REJECTED',
        });

        await expect(service.joinClass(student, 'abc123')).resolves.toEqual({
          status: 'PENDING',
        });

        expect(prismaMock.classJoinRequest.update).toHaveBeenCalledWith({
          where: { id: 'r1' },
          data: expect.objectContaining({
            status: 'PENDING',
            decidedAt: null,
            decidedById: null,
          }),
        });
        expect(prismaMock.classJoinRequest.create).not.toHaveBeenCalled();
      });
    });

    describe('listJoinRequests', () => {
      it('should list the pending requests of the class', async () => {
        const createdAt = new Date('2026-11-14T12:00:00.000Z');
        prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'ta1' });
        prismaMock.class.findUnique.mockResolvedValue({ id: 'c1' });
        prismaMock.classJoinRequest.findMany.mockResolvedValue([
          {
            id: 'r1',
            createdAt,
            student: { id: 's1', name: 'Ana', email: 'ana@escola.edu.br' },
          },
        ]);

        await expect(
          service.listJoinRequests(ownTeacher, 'c1'),
        ).resolves.toEqual([
          {
            id: 'r1',
            createdAt,
            student: { id: 's1', name: 'Ana', email: 'ana@escola.edu.br' },
          },
        ]);

        expect(prismaMock.classJoinRequest.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { classId: 'c1', status: 'PENDING' },
          }),
        );
      });

      it('should not let a teacher list requests of another teacher class', async () => {
        prismaMock.teacherAssignment.findFirst.mockResolvedValue(null);

        await expect(
          service.listJoinRequests(ownTeacher, 'c2'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prismaMock.classJoinRequest.findMany).not.toHaveBeenCalled();
      });
    });

    describe('approveJoinRequests', () => {
      it('should enroll the selected students and mark the requests as approved', async () => {
        prismaMock.classJoinRequest.findMany.mockResolvedValue([
          { id: 'r1', userId: 's1' },
          { id: 'r2', userId: 's2' },
        ]);
        prismaMock.studentAssignment.findMany.mockResolvedValue([]);

        await expect(
          service.approveJoinRequests(admin, 'c1', ['r1', 'r2']),
        ).resolves.toEqual({ approved: 2 });

        expect(prismaMock.studentAssignment.createMany).toHaveBeenCalledWith({
          data: [
            { classId: 'c1', userId: 's1' },
            { classId: 'c1', userId: 's2' },
          ],
        });
        expect(prismaMock.classJoinRequest.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['r1', 'r2'] } },
          data: expect.objectContaining({
            status: 'APPROVED',
            decidedById: '1',
          }),
        });
      });

      it('should not enroll twice a student who is already in the class', async () => {
        prismaMock.classJoinRequest.findMany.mockResolvedValue([
          { id: 'r1', userId: 's1' },
          { id: 'r2', userId: 's2' },
        ]);
        prismaMock.studentAssignment.findMany.mockResolvedValue([
          { userId: 's2' },
        ]);

        await service.approveJoinRequests(admin, 'c1', ['r1', 'r2']);

        expect(prismaMock.studentAssignment.createMany).toHaveBeenCalledWith({
          data: [{ classId: 'c1', userId: 's1' }],
        });
      });

      it('should fail when there is no pending request to approve', async () => {
        prismaMock.classJoinRequest.findMany.mockResolvedValue([]);

        await expect(
          service.approveJoinRequests(admin, 'c1', ['r9']),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prismaMock.studentAssignment.createMany).not.toHaveBeenCalled();
      });
    });

    describe('rejectJoinRequests', () => {
      it('should reject the selected pending requests', async () => {
        prismaMock.classJoinRequest.updateMany.mockResolvedValue({ count: 2 });

        await expect(
          service.rejectJoinRequests(admin, 'c1', ['r1', 'r2']),
        ).resolves.toEqual({ rejected: 2 });

        expect(prismaMock.classJoinRequest.updateMany).toHaveBeenCalledWith({
          where: {
            id: { in: ['r1', 'r2'] },
            classId: 'c1',
            status: 'PENDING',
          },
          data: expect.objectContaining({
            status: 'REJECTED',
            decidedById: '1',
          }),
        });
      });

      it('should fail when nothing was pending', async () => {
        prismaMock.classJoinRequest.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.rejectJoinRequests(admin, 'c1', ['r9']),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    it('should close a pending request when the teacher adds the student by hand', async () => {
      prismaMock.class.findUnique.mockResolvedValue({ id: 'c1' });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 's1',
        role: Role.STUDENT,
      });
      prismaMock.studentAssignment.findFirst.mockResolvedValue(null);
      prismaMock.studentAssignment.create.mockResolvedValue({ id: 'a1' });

      await service.addStudent(admin, 'c1', 's1');

      expect(prismaMock.classJoinRequest.updateMany).toHaveBeenCalledWith({
        where: { classId: 'c1', userId: 's1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'APPROVED',
          decidedById: '1',
        }),
      });
    });

    it('should include the pending requests count in the class list', async () => {
      prismaMock.class.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Turma A',
          joinCode: 'abc123',
          subject: { name: 'Cálculo', course: { name: 'Engenharia' } },
          teacherAssignments: [],
          studentAssignments: [],
          _count: { joinRequests: 3 },
        },
      ]);

      const classes = await service.listClasses(admin);

      expect(classes[0].pendingRequestsCount).toBe(3);
    });
  });
});