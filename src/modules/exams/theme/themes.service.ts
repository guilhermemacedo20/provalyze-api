import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateThemeDto } from './dto/themes.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ThemeService {
  constructor(private readonly prisma: PrismaService) {}

  async createTheme(req: any, createThemeDto: CreateThemeDto) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== 'TEACHER') {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    return this.prisma.theme.create({
      data: {
        name: createThemeDto.name,
        userId: user.id,
      },
    });
  }

  async listThemes(req: any) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== 'TEACHER') {
      throw new UnauthorizedException('Usuário não autorizado');
    }

    return this.prisma.theme.findMany({
      where: {
        userId: user.id,
      },
    });
  }

  async listTheme(req: any, id: string) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException(
        'Não foi possível buscar o tema mencionado.',
      );
    }

    const theme = await this.prisma.theme.findFirst({
      where: { id, userId: user.id },
    });

    if (!theme) {
      throw new NotFoundException('Tema não encontrado');
    }

    return theme;
  }

  async updateTheme(req: any, id: string, updateThemeDto: CreateThemeDto) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });
    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException(
        'Não foi possível atualizar o tema mencionado.',
      );
    }
    const existing = await this.prisma.theme.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundException('Tema não encontrado');
    }

    return this.prisma.theme.update({
      where: { id },
      data: {
        name: updateThemeDto.name,
      },
    });
  }

  async deleteTheme(req: any, id: string) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException(
        'Essa busca pode ser realizada apenas por professores.',
      );
    }

    const existing = await this.prisma.theme.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundException('Tema não encontrado');
    }

    return this.prisma.theme.delete({ where: { id } });
  }
}
