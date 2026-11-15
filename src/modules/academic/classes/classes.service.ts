import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateClassDto } from './dto/classes.dto';
import { JoinRequestStatus, Role } from '@prisma/client';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { generateJoinCode } from 'src/common/utils/generateCode';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  private async assertTeacherOwnClass(user: any, classId: string) {
    if (user.role !== Role.TEACHER) {
      return;
    }

    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: { classId, userId: user.id, endedAt: null },
    });
    if (!assignment) {
      throw new NotFoundException('Turma não encontrada');
    }
  }

  private async generateJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateJoinCode();
      const existing = await this.prisma.class.findUnique({
        where: { joinCode: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException(
      'Não foi possível gerar um código de acesso único. Tente novamente.',
    );
  }

  async createClass(req: any, createClassDto: CreateClassDto) {
    const user = req.user;
    const isTeacher = user.role === Role.TEACHER;
    const subject = await this.prisma.subject.findUnique({
      where: { id: createClassDto.subjectId },
    });

    if (!subject) {
      throw new NotFoundException('Matéria não encontrada');
    }

    const teacher = await this.prisma.user.findUnique({
      where: { id: createClassDto.teacherId },
    });
    if (
      !teacher ||
      teacher.role !== Role.TEACHER ||
      (isTeacher && createClassDto.teacherId !== user.id)
    ) {
      throw new BadRequestException(
        'O usuário selecionado não é um professor válido',
      );
    }

    const joinCode = await this.generateJoinCode();
    const classCreated = await this.prisma.class.create({
      data: {
        name: createClassDto.name,
        subjectId: createClassDto.subjectId,
        joinCode,
        teacherAssignments: {
          create: { userId: createClassDto.teacherId },
        },
      },
    });
    await this.logs.audit(`Class Created ${classCreated.id}`, user.id);
    return classCreated;
  }

  async resetJoinCode(req: any, id: string) {
    await this.assertTeacherOwnClass(req.user, id);

    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Turma não encontrada');
    }

    const joinCode = await this.generateJoinCode();
    await this.logs.audit(`Class join code reset ${id}`, req.user.id);
    return this.prisma.class.update({
      where: { id },
      data: { joinCode },
      select: { id: true, joinCode: true },
    });
  }

  async listClasses(req: any) {
    const user = req.user;
    const isTeacher = user.role === Role.TEACHER;
    const classes = await this.prisma.class.findMany({
      where: isTeacher
        ? {
            teacherAssignments: {
              some: { userId: user.id, endedAt: null },
            },
          }
        : undefined,
      include: {
        subject: { include: { course: { select: { name: true } } } },
        teacherAssignments: {
          where: { endedAt: null },
          include: { teacher: { select: { name: true } } },
        },
        studentAssignments: {
          where: { endedAt: null },
        },
        _count: {
          select: {
            joinRequests: { where: { status: JoinRequestStatus.PENDING } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return classes.map((schoolClass) => ({
      id: schoolClass.id,
      name: schoolClass.name,
      joinCode: schoolClass.joinCode,
      teacherName: schoolClass.teacherAssignments[0]?.teacher.name,
      subjectName: schoolClass.subject.name,
      courseName: schoolClass.subject.course.name,
      studentsCount: schoolClass.studentAssignments.length,
      pendingRequestsCount: schoolClass._count?.joinRequests ?? 0,
      averageScore: null, // ainda não existe módulo de provas/notas no sistema
    }));
  }

  async listStudentClasses(req: any) {
    const user = req.user;
    const isStudent = user.role === Role.STUDENT;

    if (!isStudent) {
      throw new BadRequestException('Usuário não possui sala cadastrada');
    }

    const classes = await this.prisma.class.findMany({
      where: {
        studentAssignments: {
          some: { userId: user.id, endedAt: null },
        },
      },
      include: {
        subject: { include: { course: { select: { name: true } } } },
        teacherAssignments: {
          where: { endedAt: null },
          include: { teacher: { select: { name: true } } },
        },
        studentAssignments: {
          where: { userId: user.id, endedAt: null },
          select: { hiddenAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return classes.map((schoolClass) => ({
      id: schoolClass.id,
      name: schoolClass.name,
      teacherName: schoolClass.teacherAssignments[0]?.teacher.name,
      subjectName: schoolClass.subject.name,
      courseName: schoolClass.subject.course.name,
      averageScore: null, // ainda não existe módulo de provas/notas no sistema
      hidden: Boolean(schoolClass.studentAssignments[0]?.hiddenAt),
    }));
  }

  async setClassHidden(req: any, classId: string, hidden: boolean) {
    const user = req.user;

    const result = await this.prisma.studentAssignment.updateMany({
      where: { classId, userId: user.id, endedAt: null },
      data: { hiddenAt: hidden ? new Date() : null },
    });

    if (result.count === 0) {
      throw new NotFoundException('Turma não encontrada');
    }

    return { hidden };
  }

  async joinClass(req: any, code: string) {
    const user = req.user;
    const joinCode = code.trim().toLowerCase();

    if (!joinCode) {
      throw new BadRequestException('Informe o código da sala');
    }

    const schoolClass = await this.prisma.class.findUnique({
      where: { joinCode },
    });
    if (!schoolClass) {
      throw new NotFoundException('Código de sala inválido');
    }

    const existing = await this.prisma.studentAssignment.findFirst({
      where: { classId: schoolClass.id, userId: user.id, endedAt: null },
    });

    if (existing) {
      throw new BadRequestException('Você já está nessa sala');
    }

    const previous = await this.prisma.classJoinRequest.findUnique({
      where: {
        classId_userId: { classId: schoolClass.id, userId: user.id },
      },
    });

    if (previous?.status === JoinRequestStatus.PENDING) {
      throw new BadRequestException(
        'Você já solicitou entrada nessa turma. Aguarde a aprovação do professor.',
      );
    }

    await this.logs.audit(
      `Student requested to join class ${schoolClass.id}`,
      user.id,
    );

    if (previous) {
      await this.prisma.classJoinRequest.update({
        where: { id: previous.id },
        data: {
          status: JoinRequestStatus.PENDING,
          createdAt: new Date(),
          decidedAt: null,
          decidedById: null,
        },
      });
    } else {
      await this.prisma.classJoinRequest.create({
        data: { classId: schoolClass.id, userId: user.id },
      });
    }

    return { status: JoinRequestStatus.PENDING };
  }

  async listJoinRequests(req: any, classId: string) {
    await this.assertTeacherOwnClass(req.user, classId);

    const schoolClass = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada');
    }

    const requests = await this.prisma.classJoinRequest.findMany({
      where: { classId, status: JoinRequestStatus.PENDING },
      include: {
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return requests.map((request) => ({
      id: request.id,
      createdAt: request.createdAt,
      student: {
        id: request.student.id,
        name: request.student.name,
        email: request.student.email,
      },
    }));
  }

  async approveJoinRequests(req: any, classId: string, requestIds: string[]) {
    await this.assertTeacherOwnClass(req.user, classId);

    const requests = await this.prisma.classJoinRequest.findMany({
      where: {
        id: { in: requestIds },
        classId,
        status: JoinRequestStatus.PENDING,
      },
    });
    if (requests.length === 0) {
      throw new NotFoundException('Nenhuma solicitação pendente encontrada');
    }

    const alreadyEnrolled = await this.prisma.studentAssignment.findMany({
      where: {
        classId,
        userId: { in: requests.map((request) => request.userId) },
        endedAt: null,
      },
      select: { userId: true },
    });
    const enrolledIds = new Set(alreadyEnrolled.map((item) => item.userId));
    const toEnroll = requests.filter(
      (request) => !enrolledIds.has(request.userId),
    );

    await this.prisma.$transaction([
      this.prisma.studentAssignment.createMany({
        data: toEnroll.map((request) => ({
          classId,
          userId: request.userId,
        })),
      }),
      this.prisma.classJoinRequest.updateMany({
        where: { id: { in: requests.map((request) => request.id) } },
        data: {
          status: JoinRequestStatus.APPROVED,
          decidedAt: new Date(),
          decidedById: req.user.id,
        },
      }),
    ]);

    await this.logs.audit(
      `Join requests approved ${classId}: ${requests.length}`,
      req.user.id,
    );

    return { approved: requests.length };
  }

  async rejectJoinRequests(req: any, classId: string, requestIds: string[]) {
    await this.assertTeacherOwnClass(req.user, classId);

    const result = await this.prisma.classJoinRequest.updateMany({
      where: {
        id: { in: requestIds },
        classId,
        status: JoinRequestStatus.PENDING,
      },
      data: {
        status: JoinRequestStatus.REJECTED,
        decidedAt: new Date(),
        decidedById: req.user.id,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Nenhuma solicitação pendente encontrada');
    }

    await this.logs.audit(
      `Join requests rejected ${classId}: ${result.count}`,
      req.user.id,
    );

    return { rejected: result.count };
  }

  async getClass(req: any, id: string) {
    await this.assertTeacherOwnClass(req.user, id);

    const schoolClass = await this.prisma.class.findUnique({
      where: { id },
      include: {
        subject: { include: { course: { select: { name: true } } } },
        teacherAssignments: {
          where: { endedAt: null },
          include: { teacher: { select: { name: true } } },
        },
        studentAssignments: {
          where: { endedAt: null },
          include: {
            student: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada');
    }

    return {
      id: schoolClass.id,
      name: schoolClass.name,
      joinCode: schoolClass.joinCode,
      teacherName: schoolClass.teacherAssignments[0]?.teacher.name,
      subjectName: schoolClass.subject.name,
      courseName: schoolClass.subject.course.name,
      students: schoolClass.studentAssignments.map((a) => ({
        id: a.student.id,
        name: a.student.name,
        email: a.student.email,
      })),
    };
  }

  async addStudent(req: any, classId: string, studentId: string) {
    await this.assertTeacherOwnClass(req.user, classId);

    const schoolClass = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada');
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    if (!student || student.role !== Role.STUDENT) {
      throw new BadRequestException(
        'O usuário selecionado não é um aluno válido',
      );
    }

    const existing = await this.prisma.studentAssignment.findFirst({
      where: { classId, userId: studentId, endedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        'Esse aluno já está matriculado nessa turma',
      );
    }
    await this.logs.audit(
      `Student added ${classId} and student: ${studentId}`,
      req.user.id,
    );

    // se o aluno tinha uma solicitação pendente, ela deixa de estar pendente
    await this.prisma.classJoinRequest.updateMany({
      where: { classId, userId: studentId, status: JoinRequestStatus.PENDING },
      data: {
        status: JoinRequestStatus.APPROVED,
        decidedAt: new Date(),
        decidedById: req.user.id,
      },
    });

    return this.prisma.studentAssignment.create({
      data: { classId, userId: studentId },
    });
  }

  async removeStudent(req: any, classId: string, studentId: string) {
    await this.assertTeacherOwnClass(req.user, classId);

    const assignment = await this.prisma.studentAssignment.findFirst({
      where: { classId, userId: studentId, endedAt: null },
    });

    if (!assignment) {
      throw new NotFoundException('Aluno não encontrado nessa turma');
    }

    await this.logs.audit(
      `Student removed ${classId} and student: ${studentId}`,
      req.user.id,
    );

    return this.prisma.studentAssignment.update({
      where: { id: assignment.id },
      data: { endedAt: new Date() },
    });
  }

  async deleteClass(req: any, id: string) {
    await this.assertTeacherOwnClass(req.user, id);

    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Turma não encontrada');
    }

    const sessions = await this.prisma.examSession.count({
      where: { exam: { assignments: { some: { classId: id } } } },
    });
    if (sessions > 0) {
      throw new ConflictException(
        'Essa turma já tem provas realizadas e não pode ser excluída',
      );
    }

    await this.logs.audit(`Class Deleted ${id}`, req.user.id);
    return this.prisma.class.delete({ where: { id } });
  }
}