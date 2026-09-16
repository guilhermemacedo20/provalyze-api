import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { anonymizedAt: null },
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

  async createUser(createUserDto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: createUserDto,
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

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado');
    }

    try {
      return await this.prisma.user.update({
        where: { id },
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

  async deleteUser(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (existing.role === Role.ADMIN) {
      const activeAdminsCount = await this.prisma.user.count({
        where: { role: Role.ADMIN, anonymizedAt: null },
      });

      if (activeAdminsCount <= 1) {
        throw new BadRequestException(
          'Não é possível excluir o único administrador do sistema.',
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        name: 'Usuário removido',
        email: `removido-${id}@anon.provalyze.local`,
        anonymizedAt: new Date(),
      },
    });
  }
}
