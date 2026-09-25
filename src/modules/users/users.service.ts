import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
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
    const users = await this.prisma.user.findMany({
      where: isTeacher
        ? { role: 'STUDENT', anonymizedAt: null }
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

  async createUserFromAdmin(createUserDto: CreateUserDto) {
    const hasUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (hasUser) {
      throw new BadRequestException(
        'Já existe um usuário cadastrado com esse e-mail.',
      );
    }

    const user = await this.prisma.user.create({
      data: createUserDto,
    });

    await this.mail.sendCreateUser(createUserDto.email);

    return user;
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

  async deleteUser(req: any, id: string) {
    const isAdmin = req.user.role === 'ADMIN';

    if (!isAdmin && req.user.id !== id) {
      throw new UnauthorizedException(
        'Perfil de acesso sem permissão para realizar esse processo',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
    });

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
