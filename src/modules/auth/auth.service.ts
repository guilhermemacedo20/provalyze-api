import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { generateCode } from 'src/common/utils/generateCode';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async loginUser(data: LoginDto) {
    const email = data.email;

    const user = await this.prisma.user.findUnique({ where: { email } });

    const invalid =
      !user || !(await bcrypt.compare(data.password, user.password));

    if (invalid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const accessToken = this.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
    });

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

    // await this. TO-DO: Realizar lógica do envio de e-mail com o código de redefinição de senha
    console.info(
      `Código de redefinição de senha para o usuário ${user.id}: ${resetCode}`,
    );
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
    } catch (err) {
      return { message: 'Ocorreu um erro ao atualizar a senha' };
    }

    return { message: 'Senha redefinida com sucesso.' };
  }

  async changePassword(data: ChangePasswordDto) {
    //TO-DO: Mudar para trazer o usuário logado com jwt
    const email = data.email;
    const user = await this.prisma.user.findUnique({ where: { email } });

    const errorMessage = 'Não foi possível alterar a senha';

    if (!user) {
      throw new UnauthorizedException(errorMessage);
    }

    const samePassword = await bcrypt.compare(
      data.actualPassword,
      user.password,
    );

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    if (samePassword) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });
    } else {
      throw new UnauthorizedException(errorMessage);
    }

    return { message: 'Senha redefinida com sucesso.' };
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
