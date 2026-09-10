import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';
import { Role } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCourse(req: any, createCourseDto: CreateCourseDto) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    return this.prisma.course.create({
      data: { name: createCourseDto.name },
    });
  }

  async listCourses(req: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCourse(req: any, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    const course = await this.prisma.course.findUnique({ where: { id } });

    if (!course) {
      throw new NotFoundException('Curso não encontrado');
    }

    return course;
  }

  async updateCourse(req: any, id: string, updateCourseDto: UpdateCourseDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    const existing = await this.prisma.course.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Curso não encontrado');
    }

    return this.prisma.course.update({
      where: { id },
      data: { name: updateCourseDto.name },
    });
  }

  async deleteCourse(req: any, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    const existing = await this.prisma.course.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Curso não encontrado');
    }

    return this.prisma.course.delete({ where: { id } });
  }
}