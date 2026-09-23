import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubjectDto } from './dto/subjects.dto';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

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
    await this.requireCourse(courseId);
    const createdSubject = await this.prisma.subject.create({
      data: {
        name: createSubjectDto.name,
        courseId,
      },
    });
    await this.logs.audit(`Subject created ${createdSubject.id}`, req.user.id);
    return createdSubject;
  }

  async listSubjects(courseId: string) {
    await this.requireCourse(courseId);

    return this.prisma.subject.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAllSubjects() {
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
    await this.requireCourse(courseId);

    const existing = await this.prisma.subject.findFirst({
      where: { id: subjectId, courseId },
    });

    if (!existing) {
      throw new NotFoundException('Matéria não encontrada');
    }

    await this.logs.audit(`Subject deleted ${existing.id}`, req.user.id);

    return this.prisma.subject.delete({ where: { id: subjectId } });
  }
}
