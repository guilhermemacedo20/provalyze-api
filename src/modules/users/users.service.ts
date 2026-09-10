import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
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

  async listUsers(req: any) {
    await this.requireAdmin(req);

    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
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

  async createUser(req: any, createUserDto: CreateUserDto) {
    await this.requireAdmin(req);

    return this.prisma.user.create({ data: createUserDto });
  }

  async getUser(req: any, id: string) {
    await this.requireAdmin(req);

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  async updateUser(req: any, id: string, updateUserDto: UpdateUserDto) {
    await this.requireAdmin(req);

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.prisma.user.update({ where: { id }, data: updateUserDto });
  }

  async deleteUser(req: any, id: string) {
    await this.requireAdmin(req);

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.prisma.user.delete({ where: { id } });
  }
}