import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async audit(action: string, actorId: string) {
    const logsEnable = this.config.get<string>('HAS_LOGS') === 'true';

    if (!logsEnable) {
      return;
    }

    try {
      await this.prisma.auditEvent.create({
        data: {
          action: action,
          actorId: actorId,
        },
      });
    } catch (error) {
      console.info(`Ocorreu um erro ao gerar o log ${action} de ${actorId}`);
    }
  }
}
