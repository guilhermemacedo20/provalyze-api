import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { UsersService } from './users.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { mailMock } from 'src/test/mocks/mail.mock';

describe('UsersService', () => {
  const service = new UsersService(
    prismaMock as unknown as PrismaService,
    mailMock,
  );
  const admin = { user: { id: '1', role: Role.ADMIN } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should anonymize a user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.TEACHER,
    });

    prismaMock.user.update.mockResolvedValue({ id: '1' });

    await service.deleteUser({ user: { id: '1', role: Role.TEACHER } }, '1');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        name: 'Usuário removido',
        email: 'removido-1@anon.provalyze.local',
        anonymizedAt: expect.any(Date),
        password: null,
        registrationNumber: null,
      },
      select: { id: true },
    });

    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('should get user by ID', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.ADMIN,
    });

    await expect(service.getUser('1')).resolves.toEqual({
      id: '1',
      role: Role.ADMIN,
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should update user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.TEACHER,
    });
    prismaMock.user.update.mockResolvedValue({
      id: '1',
      name: 'Updated Name',
      email: 'test@example.com',
      role: Role.TEACHER,
    });

    await expect(
      service.updateUser(admin, '1', {
        name: 'Updated Name',
        email: 'test@example.com',
        role: Role.TEACHER,
      }),
    ).resolves.toEqual({
      id: '1',
      name: 'Updated Name',
      email: 'test@example.com',
      role: Role.TEACHER,
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        name: 'Updated Name',
        email: 'test@example.com',
        role: Role.TEACHER,
      },
    });
  });

  it('should not allow deletion of the unique administrator', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.ADMIN,
    });
    prismaMock.user.count.mockResolvedValue(1);

    await expect(service.deleteUser(admin, '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.deleteUser(admin, '1')).rejects.toEqual(
      expect.objectContaining({
        message: 'Não é possível excluir o único administrador do sistema.',
      }),
    );

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('should allow to delete an administrator when another exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.ADMIN,
    });
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.user.delete.mockResolvedValue({ id: '1' });

    await service.deleteUser(admin, '1');

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { role: Role.ADMIN, anonymizedAt: null },
    });
    expect(prismaMock.user.delete).toHaveBeenCalled();
  });

  describe('exclusão de aluno', () => {
    const student = { id: 's1', name: 'Maria Souza', role: Role.STUDENT };
    const studentReq = { user: { id: 's1', role: Role.STUDENT } };

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue(student);
    });

    it('apaga fisicamente o aluno sem nenhuma prova realizada', async () => {
      prismaMock.examSession.count.mockResolvedValue(0);

      const result = await service.deleteUser(studentReq, 's1');

      expect(result).toEqual({ id: 's1', anonymized: false });
      expect(prismaMock.studentAssignment.deleteMany).toHaveBeenCalledWith({
        where: { userId: 's1' },
      });
      expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 's1' },
      });
      expect(prismaMock.user.delete).toHaveBeenCalledWith({
        where: { id: 's1' },
      });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(prismaMock.pedagogicalReport.update).not.toHaveBeenCalled();
    });

    it('anonimiza o aluno com prova realizada e mantém sessões e respostas', async () => {
      prismaMock.examSession.count.mockResolvedValue(2);
      prismaMock.studentAssignment.findMany.mockResolvedValue([
        { classId: 'c1' },
        { classId: 'c2' },
      ]);
      prismaMock.pedagogicalReport.findMany.mockResolvedValue([
        {
          id: 'r1',
          content: {
            average: 7,
            students: [
              { name: 'Maria Souza', exams: [{ title: 'P1', score: 8 }] },
              { name: 'João Lima', exams: [{ title: 'P1', score: 6 }] },
            ],
          },
        },
        {
          id: 'r2',
          content: { students: [{ name: 'João Lima', exams: [] }] },
        },
        { id: 'r3', content: { gaps: [] } },
      ]);

      const result = await service.deleteUser(studentReq, 's1');

      expect(result).toEqual({ id: 's1', anonymized: true });
      expect(prismaMock.pedagogicalReport.findMany).toHaveBeenCalledWith({
        where: { classId: { in: ['c1', 'c2'] } },
        select: { id: true, content: true },
      });
      expect(prismaMock.pedagogicalReport.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.pedagogicalReport.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: {
          content: {
            average: 7,
            students: [
              { name: 'Usuário removido', exams: [{ title: 'P1', score: 8 }] },
              { name: 'João Lima', exams: [{ title: 'P1', score: 6 }] },
            ],
          },
        },
      });
      expect(prismaMock.studentAssignment.deleteMany).toHaveBeenCalledWith({
        where: { userId: 's1' },
      });
      expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 's1' },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          name: 'Usuário removido',
          email: 'removido-s1@anon.provalyze.local',
          registrationNumber: null,
          password: null,
          anonymizedAt: expect.any(Date),
        },
      });
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
      expect(prismaMock.examSession.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.answer.deleteMany).not.toHaveBeenCalled();
    });

    it('não deixa um aluno excluir outro usuário', async () => {
      await expect(
        service.deleteUser(studentReq, 'outro'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });
});
