import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateThemeDto } from './dto/themes.dto';

@Injectable()
export class ThemeService {
  constructor(private readonly prisma: PrismaService) {}

  async createTheme(req: any, createThemeDto: CreateThemeDto) {
    const user = req.user;

    return this.prisma.theme.create({
      data: {
        name: createThemeDto.name,
        userId: user.id,
      },
    });
  }

  async listThemes(req: any) {
    const user = req.user;

    return this.prisma.theme.findMany({
      where: {
        userId: user.id,
      },
    });
  }

  async listTheme(req: any, id: string) {
    const user = req.user;

    const theme = await this.prisma.theme.findFirst({
      where: { id, userId: user.id },
    });

    if (!theme) {
      throw new NotFoundException('Tema não encontrado');
    }

    return theme;
  }

  async updateTheme(req: any, id: string, updateThemeDto: CreateThemeDto) {
    const user = req.user;

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
    const user = req.user;

    const existing = await this.prisma.theme.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundException('Tema não encontrado');
    }

    return this.prisma.theme.delete({ where: { id } });
  }
}
