import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { generateCode } from 'src/common/utils/generateCode';
import { assertPasswordStrength } from 'src/common/utils/password';
import { JwtService } from '@nestjs/jwt';
import { LogsService } from 'src/infra/logs/logs.service';
import { MailService } from 'src/infra/mail/mail.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly logs: LogsService,
    private readonly mail: MailService,
  ) {}

  async loginUser(data: LoginDto) {
    const email = data.email;
    const message = 'Usuário ou senha inválidos';

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException(message);
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'É necessário solicitar o reset de senha.',
      );
    }

    if (user.anonymizedAt) {
      throw new UnauthorizedException(
        'Entre em contato com o time de suporte, seu usuário se encontra excluido.',
      );
    }

    const invalid = !(await bcrypt.compare(data.password, user.password));

    if (invalid) {
      throw new UnauthorizedException(message);
    }

    const accessToken = this.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await this.logs.audit('User login', user.id);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        registrationNumber: user.registrationNumber,
      },
    };
  }

  async forgotPassword(body: ForgotPasswordDto) {
    const email = body.email;
    const user = await this.prisma.user.findUnique({ where: { email } });
    const resetCode = generateCode();
    const resetCodeHashed = await bcrypt.hash(resetCode, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const message =
      'Se o e-mail existir, enviaremos um código para redefinir a senha.';

    if (!user) {
      return { message };
    }

    await this.logs.audit('Forgot password', user.id);

    await this.mail.sendPasswordReset(body.email, resetCode, expiresAt);

    await this.prisma.passwordResetToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        code: resetCodeHashed,
        expiresAt,
        usedAt: null,
      },
      update: {
        code: resetCodeHashed,
        expiresAt,
        usedAt: null,
      },
    });
    return { message };
  }

  async resetPassword(data: ResetPasswordDto) {
    const email = data.email;
    const user = await this.prisma.user.findUnique({ where: { email } });

    const errorMessage = 'Código inválido ou expirado';

    if (!user) {
      throw new UnauthorizedException(errorMessage);
    }

    const token = await this.prisma.passwordResetToken.findUnique({
      where: { userId: user.id },
    });

    if (!token || token.expiresAt <= new Date() || token.usedAt) {
      throw new UnauthorizedException(errorMessage);
    }

    const validCode = await bcrypt.compare(data.code, token.code);

    if (!validCode) {
      throw new UnauthorizedException(errorMessage);
    }

    assertPasswordStrength(data.newPassword);

    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      });

      await this.prisma.passwordResetToken.update({
        where: { userId: user.id },
        data: { usedAt: new Date() },
      });
    } catch {
      throw new BadRequestException('Ocorreu um erro ao atualizar a senha');
    }

    await this.logs.audit('Reset password', user.id);

    return { message: 'Senha redefinida com sucesso.' };
  }

  async changePassword(req: any, data: ChangePasswordDto) {
    const email = req.user.email;
    const user = await this.prisma.user.findUnique({ where: { email } });

    const errorMessage = 'Não foi possível alterar a senha';

    if (!user || !user.password) {
      throw new UnauthorizedException(errorMessage);
    }

    const samePassword = await bcrypt.compare(
      data.actualPassword,
      user.password,
    );

    if (!samePassword) {
      throw new UnauthorizedException(errorMessage);
    }

    assertPasswordStrength(data.newPassword);

    if (data.newPassword === data.actualPassword) {
      throw new BadRequestException('A nova senha deve ser diferente da atual.');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await this.logs.audit('Change password', user.id);

    return { message: 'Senha redefinida com sucesso.' };
  }

  async registerUser(data: RegisterDto) {
    const email = data.email;
    const hasUser = await this.prisma.user.findUnique({ where: { email } });

    if (hasUser) {
      throw new ConflictException('Usuário já possui conta cadastrada');
    }

    if (data.role !== Role.STUDENT && data.role !== Role.TEACHER) {
      throw new BadRequestException('Perfil de acesso não permitido');
    }

    assertPasswordStrength(data.password);

    const hashPassword = await bcrypt.hash(data.password, 10);

    const userCreated = await this.prisma.user.create({
      data: { ...data, password: hashPassword },
    });

    return {
      user: {
        name: userCreated.name,
        email: userCreated.email,
        id: userCreated.id,
      },
    };
  }

  async me(loggedUser: { email: string; id: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: loggedUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        registrationNumber: true,
        password: false,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return user;
  }
}
