import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { TERMS_VERSION } from 'src/common/constants/terms';
import { SKIP_TERMS_KEY } from 'src/common/decorators/skip-terms.decorator';
import { PrismaService } from 'src/infra/prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id: string } }>();
    const user = request.user
      ? await this.prisma.user.findUnique({
          where: { id: request.user.id },
          select: { termsVersion: true, anonymizedAt: true },
        })
      : null;

    if (!user || user.anonymizedAt) {
      throw new UnauthorizedException(
        'Seu usuário se encontra excluido.',
      );
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TERMS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    if (user.termsVersion !== TERMS_VERSION) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TERMS_NOT_ACCEPTED',
        message:
          'É necessário aceitar a versão atual dos Termos de Uso e da Política de Privacidade.',
      });
    }

    return true;
  }
}
