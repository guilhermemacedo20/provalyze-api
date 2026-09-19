import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCourse(createCourseDto: CreateCourseDto) {
    return this.prisma.course.create({
      data: { name: createCourseDto.name },
    });
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

  async updateCourse(id: string, updateCourseDto: UpdateCourseDto) {
    const existing = await this.prisma.course.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Curso não encontrado');
    }

    return this.prisma.course.update({
      where: { id },
      data: { name: updateCourseDto.name },
    });
  }

  async deleteCourse(id: string) {
    const existing = await this.prisma.course.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Curso não encontrado');
    }

    return this.prisma.course.delete({ where: { id } });
  }
}
