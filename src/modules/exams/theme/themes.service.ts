import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateThemeDto } from './dto/themes.dto';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  async createTheme(req: any, createThemeDto: CreateThemeDto) {
    const user = req.user;
    const themeCreated = await this.prisma.theme.create({
      data: {
        name: createThemeDto.name,
        userId: user.id,
      },
    });

    await this.logs.audit(`Theme Created ${themeCreated.id}`, user.id);

    return themeCreated;
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
    await this.logs.audit(`Theme Updated ${existing.id}`, user.id);
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

    await this.logs.audit(`Theme Deleted ${existing.id}`, user.id);

    return this.prisma.theme.delete({ where: { id } });
  }
}
