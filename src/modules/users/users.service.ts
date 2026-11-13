import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { MailService } from 'src/infra/mail/mail.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async listUsers(req: any) {
    const user = req.user;
    const isTeacher = user.role === Role.TEACHER;
    const isCoordinator = user.role === Role.COORDINATOR;
    const users = await this.prisma.user.findMany({
      where: isTeacher
        ? { role: Role.STUDENT, anonymizedAt: null }
        : isCoordinator
          ? {
              role: { in: [Role.TEACHER, Role.STUDENT] },
              anonymizedAt: null,
            }
          : { anonymizedAt: null },
      orderBy: { name: 'asc' },
      include: {
        teacherAssignments: {
          where: { endedAt: null },
          include: { class: { select: { name: true } } },
        },
        studentAssignments: {
          where: { endedAt: null },
          include: { class: { select: { name: true } } },
        },
      },
    });

    return users.map((user) => {
      const classNames =
        user.role === Role.TEACHER
          ? user.teacherAssignments.map((a) => a.class.name)
          : user.role === Role.STUDENT
            ? user.studentAssignments.map((a) => a.class.name)
            : [];

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        classes: classNames,
        createdAt: user.createdAt,
      };
    });
  }

  async createUserFromAdmin(req: any, createUserDto: CreateUserDto) {
    const actualUser = req.user;
    const hasUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (hasUser) {
      throw new BadRequestException(
        'Já existe um usuário cadastrado com esse e-mail.',
      );
    }
    if (
      actualUser.role === Role.COORDINATOR &&
      createUserDto.role !== Role.TEACHER &&
      createUserDto.role !== Role.STUDENT
    ) {
      throw new BadRequestException(
        'Usuário pode criar apenas professor ou aluno',
      );
    }
    const user = await this.prisma.user.create({
      data: createUserDto,
      select: {
        id: true,
        name: true,
        role: true,
        email: true,
        createdAt: true,
        registrationNumber: true,
      },
    });

    await this.mail.sendCreateUser(createUserDto.email);

    return user;
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        role: true,
        email: true,
        createdAt: true,
        registrationNumber: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  async updateUser(req: any, id: string, updateUserDto: UpdateUserDto) {
    const user = req.user;
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.anonymizedAt) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (existing.role === Role.ADMIN && updateUserDto.role !== Role.ADMIN) {
      await this.assertNotLastAdmin(
        'Não é possível alterar o perfil do único administrador do sistema.',
      );
    }

    if (user.role === Role.COORDINATOR) {
      if (
        existing.role === Role.COORDINATOR ||
        existing.role === Role.ADMIN ||
        updateUserDto.role === Role.COORDINATOR ||
        updateUserDto.role === Role.ADMIN
      ) {
        throw new BadRequestException(
          'Usuário pode alterar apenas professor ou aluno',
        );
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        select: {
          id: true,
          name: true,
          role: true,
          email: true,
          createdAt: true,
          registrationNumber: true,
        },
        data: updateUserDto,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Já existe um usuário cadastrado com esse e-mail.',
        );
      }
      throw error;
    }
  }

  async deleteUser(req: any, id: string) {
    const isAdmin = req.user.role === Role.ADMIN;
    const isCoordinator = req.user.role === Role.COORDINATOR;
    const isSelf = req.user.id === id;

    if (!isAdmin && !isCoordinator && !isSelf) {
      throw new ForbiddenException(
        'Perfil de acesso sem permissão para realizar esse processo',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existing || existing.anonymizedAt) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (
      isCoordinator &&
      !isSelf &&
      existing.role !== Role.TEACHER &&
      existing.role !== Role.STUDENT
    ) {
      throw new ForbiddenException(
        'Usuário pode excluir apenas professor ou aluno',
      );
    }

    if (existing.role === Role.ADMIN) {
      await this.assertNotLastAdmin(
        'Não é possível excluir o único administrador do sistema.',
      );
    }

    if (existing.role === Role.ADMIN || existing.role === Role.COORDINATOR) {
      try {
        return await this.prisma.user.delete({
          where: { id },
          select: { id: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          throw new ConflictException(
            'Esse usuário possui vínculos com turmas, temas, questões ou provas e não pode ser apagado.',
          );
        }
        throw error;
      }
    }

    if (existing.role === Role.STUDENT) {
      return this.deleteStudent(existing);
    }

    return this.prisma.$transaction([
      this.prisma.teacherAssignment.updateMany({
        where: { userId: id, endedAt: null },
        data: { endedAt: new Date() },
      }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: {
          name: 'Usuário removido',
          email: `removido-${id}@anon.provalyze.local`,
          registrationNumber: null,
          password: null,
          anonymizedAt: new Date(),
        },
        select: { id: true },
      }),
    ]);
  }

  private async assertNotLastAdmin(message: string) {
    const activeAdminsCount = await this.prisma.user.count({
      where: { role: Role.ADMIN, anonymizedAt: null },
    });

    if (activeAdminsCount <= 1) {
      throw new BadRequestException(message);
    }
  }

  private async deleteStudent(student: { id: string; name: string }) {
    const { id } = student;
    const sessions = await this.prisma.examSession.count({
      where: { userId: id },
    });

    if (sessions === 0) {
      await this.prisma.$transaction([
        this.prisma.studentAssignment.deleteMany({ where: { userId: id } }),
        this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
      return { id, anonymized: false };
    }

    const assignments = await this.prisma.studentAssignment.findMany({
      where: { userId: id },
      select: { classId: true },
    });
    const reports = await this.prisma.pedagogicalReport.findMany({
      where: { classId: { in: assignments.map((a) => a.classId) } },
      select: { id: true, content: true },
    });

    const renamedReports = reports.flatMap((report) => {
      const content = report.content as {
        students?: { id?: string; name: string }[];
      } | null;
      const isStudent = (s: { id?: string; name: string }) =>
        s.id ? s.id === id : s.name === student.name;
      if (!content?.students?.some(isStudent)) {
        return [];
      }
      const students = content.students.map((s) =>
        isStudent(s) ? { ...s, name: 'Usuário removido' } : s,
      );
      return [
        this.prisma.pedagogicalReport.update({
          where: { id: report.id },
          data: { content: { ...content, students } },
        }),
      ];
    });

    await this.prisma.$transaction([
      ...renamedReports,
      this.prisma.studentAssignment.updateMany({
        where: { userId: id, endedAt: null },
        data: { endedAt: new Date() },
      }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: {
          name: 'Usuário removido',
          email: `removido-${id}@anon.provalyze.local`,
          registrationNumber: null,
          password: null,
          anonymizedAt: new Date(),
        },
      }),
    ]);
    return { id, anonymized: true };
  }
}
