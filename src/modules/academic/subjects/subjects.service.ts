import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSubjectDto } from './dto/subjects.dto';
import { Role } from '@prisma/client';

@Injectable()
export class SubjectsService {
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

  private async requireCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Curso não encontrado');
    }

    return course;
  }

  async createSubject(
    req: any,
    courseId: string,
    createSubjectDto: CreateSubjectDto,
  ) {
    await this.requireAdmin(req);
    await this.requireCourse(courseId);

    return this.prisma.subject.create({
      data: {
        name: createSubjectDto.name,
        courseId,
      },
    });
  }

  async listSubjects(req: any, courseId: string) {
    await this.requireAdmin(req);
    await this.requireCourse(courseId);

    return this.prisma.subject.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAllSubjects(req: any) {
    await this.requireAdmin(req);

    const subjects = await this.prisma.subject.findMany({
      include: { course: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    return subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      courseName: subject.course.name,
    }));
  }

  async deleteSubject(req: any, courseId: string, subjectId: string) {
    await this.requireAdmin(req);
    await this.requireCourse(courseId);

    const existing = await this.prisma.subject.findFirst({
      where: { id: subjectId, courseId },
    });

    if (!existing) {
      throw new NotFoundException('Matéria não encontrada');
    }

    return this.prisma.subject.delete({ where: { id: subjectId } });
  }
}