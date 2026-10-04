import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  async createCourse(req: any, createCourseDto: CreateCourseDto) {
    try {
      const courseCreated = await this.prisma.course.create({
        data: { name: createCourseDto.name },
      });

      await this.logs.audit(`Course created ${courseCreated.id} `, req.user.id);
      return courseCreated;
    } catch (error) {
      this.handleDuplicatedName(error);
    }
  }

  async listCourses() {
    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCourse(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });

    if (!course) {
      throw new NotFoundException('Curso não encontrado');
    }

    return course;
  }

  async updateCourse(req: any, id: string, updateCourseDto: UpdateCourseDto) {
    const existing = await this.prisma.course.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Curso não encontrado');
    }
    await this.logs.audit(`Course update ${id}`, req.user.id);
    try {
      return await this.prisma.course.update({
        where: { id },
        data: { name: updateCourseDto.name },
      });
    } catch (error) {
      this.handleDuplicatedName(error);
    }
  }

  async deleteCourse(req: any, id: string) {
    const existing = await this.prisma.course.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Curso não encontrado');
    }

    await this.logs.audit(`Course deleted ${existing.id}`, req.user.id);

    return this.prisma.course.delete({ where: { id } });
  }

  private handleDuplicatedName(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Já existe um curso com esse nome');
    }
    throw error;
  }
}