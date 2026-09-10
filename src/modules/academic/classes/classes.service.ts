import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClassDto } from './dto/classes.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireAdmin(req: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    return user;
  }

  // Gera um código curto (ex: "kf82h1qz"), tentando algumas vezes
  // caso, por azar, gere um código que já existe (é raríssimo, mas
  // o banco garante unicidade, então tratamos essa possibilidade).
  private async generateJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Math.random().toString(36).slice(2, 10);
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
    await this.requireAdmin(req);

    const subject = await this.prisma.subject.findUnique({
      where: { id: createClassDto.subjectId },
    });
    if (!subject) {
      throw new NotFoundException('Matéria não encontrada');
    }

    const teacher = await this.prisma.user.findUnique({
      where: { id: createClassDto.teacherId },
    });
    if (!teacher || teacher.role !== Role.TEACHER) {
      throw new BadRequestException(
        'O usuário selecionado não é um professor válido',
      );
    }

    const joinCode = await this.generateJoinCode();

    return this.prisma.class.create({
      data: {
        name: createClassDto.name,
        subjectId: createClassDto.subjectId,
        joinCode,
        teacherAssignments: {
          create: { userId: createClassDto.teacherId },
        },
      },
    });
  }

  async listClasses(req: any) {
    await this.requireAdmin(req);

    const classes = await this.prisma.class.findMany({
      include: {
        subject: { include: { course: { select: { name: true } } } },
        teacherAssignments: {
          where: { endedAt: null },
          include: { teacher: { select: { name: true } } },
        },
        studentAssignments: {
          where: { endedAt: null },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return classes.map((schoolClass) => ({
      id: schoolClass.id,
      name: schoolClass.name,
      joinCode: schoolClass.joinCode,
      teacherName: schoolClass.teacherAssignments[0]?.teacher.name ?? '—',
      subjectName: schoolClass.subject.name,
      courseName: schoolClass.subject.course.name,
      studentsCount: schoolClass.studentAssignments.length,
      averageScore: null, // ainda não existe módulo de provas/notas no sistema
    }));
  }

  async getClass(req: any, id: string) {
    await this.requireAdmin(req);

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
      teacherName: schoolClass.teacherAssignments[0]?.teacher.name ?? '—',
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
    await this.requireAdmin(req);

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
      throw new BadRequestException('Esse aluno já está matriculado nessa turma');
    }

    return this.prisma.studentAssignment.create({
      data: { classId, userId: studentId },
    });
  }

  async removeStudent(req: any, classId: string, studentId: string) {
    await this.requireAdmin(req);

    const assignment = await this.prisma.studentAssignment.findFirst({
      where: { classId, userId: studentId, endedAt: null },
    });

    if (!assignment) {
      throw new NotFoundException('Aluno não encontrado nessa turma');
    }

    return this.prisma.studentAssignment.update({
      where: { id: assignment.id },
      data: { endedAt: new Date() },
    });
  }

  async deleteClass(req: any, id: string) {
    await this.requireAdmin(req);

    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Turma não encontrada');
    }

    return this.prisma.class.delete({ where: { id } });
  }
}