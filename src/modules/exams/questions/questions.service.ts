import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateQuestionDto, ListQuestionsDto } from './dto/questions.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QuestionType, Role } from '@prisma/client';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createQuestion(req: any, createQuestion: CreateQuestionDto) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException('Acesso não autorizado');
    }

    const theme = await this.prisma.theme.findFirst({
      where: { id: createQuestion.themeId, userId: user.id },
    });

    if (!theme) {
      throw new NotFoundException('Tema não encontrado para o usuário logado');
    }

    let questionCreated;
    const options = createQuestion.options?.length
      ? createQuestion.options
      : undefined;
    if (createQuestion.type === QuestionType.OPEN_ENDED) {
      questionCreated = await this.prisma.question.create({
        data: {
          statement: createQuestion.statement,
          type: 'OPEN_ENDED',
          themeId: createQuestion.themeId,
          userId: user.id,
        },
      });
    }

    if (createQuestion.type === QuestionType.MULTIPLE_CHOICE) {
      questionCreated = await this.prisma.question.create({
        data: {
          statement: createQuestion.statement,
          type: 'MULTIPLE_CHOICE',
          themeId: createQuestion.themeId,
          correctOption: createQuestion.correctOption,
          userId: user.id,
          ...(options
            ? {
                questionOptions: {
                  create: options.map((option) => ({
                    label: option.label,
                    text: option.text,
                    isCorrect: option.isCorrect,
                  })),
                },
              }
            : {}),
        },
        include: { questionOptions: true },
      });
    }

    if (!questionCreated) {
      throw new InternalServerErrorException(
        'Ocorreu um erro ao realizar a criação da questão',
      );
    }

    return questionCreated;
  }

  async listQuestion(req: any, id: string) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException(
        'Não foi possível buscar a questão mencionada.',
      );
    }

    const question = await this.prisma.question.findFirst({
      where: { id, userId: user.id },
    });

    if (!question) {
      throw new NotFoundException('Questão não encontrada');
    }

    return question;
  }

  async listQuestions(req: any, query: ListQuestionsDto) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException(
        'Essa busca pode ser realizada apenas por professores.',
      );
    }

    const questions = await this.prisma.question.findMany({
      where: {
        userId: user.id,
        ...(query.themeId ? { themeId: query.themeId } : {}),
      },
    });

    return questions;
  }

  async updateQuestion(
    req: any,
    id: string,
    updateQuestionDto: CreateQuestionDto,
  ) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });
    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException(
        'Não foi possível atualizar a questão mencionada.',
      );
    }
    const theme = await this.prisma.theme.findFirst({
      where: { id: updateQuestionDto.themeId, userId: user.id },
    });

    if (!theme) {
      throw new NotFoundException('Tema não encontrado para o usuário logado');
    }

    const existing = await this.prisma.question.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundException('Questão não encontrada');
    }

    const isMultiple = updateQuestionDto.type === QuestionType.MULTIPLE_CHOICE;
    const options = updateQuestionDto.options ?? [];

    await this.prisma.questionOption.deleteMany({ where: { questionId: id } });

    return this.prisma.question.update({
      where: { id },
      data: {
        statement: updateQuestionDto.statement,
        type: updateQuestionDto.type,
        themeId: updateQuestionDto.themeId,
        correctOption: isMultiple ? updateQuestionDto.correctOption : null,
        ...(isMultiple && options.length
          ? {
              questionOptions: {
                create: options.map((option, index) => ({
                  label: option.label,
                  text: option.text,
                  isCorrect: option.isCorrect,
                })),
              },
            }
          : {}),
      },
    });
  }

  async deleteQuestion(req: any, id: string) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== Role.TEACHER) {
      throw new UnauthorizedException(
        'Essa busca pode ser realizada apenas por professores.',
      );
    }

    const existing = await this.prisma.question.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundException('Questão não encontrada');
    }

    return this.prisma.question.delete({ where: { id } });
  }
}
