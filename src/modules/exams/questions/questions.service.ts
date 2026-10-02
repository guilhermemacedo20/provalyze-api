import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateQuestionDto, ListQuestionsDto } from './dto/questions.dto';
import { QuestionType } from '@prisma/client';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  async createQuestion(req: any, createQuestion: CreateQuestionDto) {
    const user = req.user;

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
          imageUrl: createQuestion.imageUrl,
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
          imageUrl: createQuestion.imageUrl,
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
      await this.logs.audit('Question error creation', user.id);
      throw new InternalServerErrorException(
        'Ocorreu um erro ao realizar a criação da questão',
      );
    }
    await this.logs.audit(`Question created ${questionCreated.id}`, user.id);
    return questionCreated;
  }

  async listQuestion(req: any, id: string) {
    const user = req.user;

    const question = await this.prisma.question.findFirst({
      where: { id, userId: user.id },
      include: {
        questionOptions: {
          orderBy: { label: 'asc' },
        },
      },
    });

    if (!question) {
      throw new NotFoundException('Questão não encontrada');
    }

    return question;
  }

  async listQuestions(req: any, query: ListQuestionsDto) {
    const user = req.user;

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
    const user = req.user;

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

    await this.logs.audit(`Question updated ${existing.id}`, user.id);

    return this.prisma.question.update({
      where: { id },
      data: {
        statement: updateQuestionDto.statement,
        type: updateQuestionDto.type,
        themeId: updateQuestionDto.themeId,
        imageUrl: updateQuestionDto.imageUrl,
        correctOption: isMultiple ? updateQuestionDto.correctOption : null,
        ...(isMultiple && options.length
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
      include: {
        questionOptions: {
          orderBy: { label: 'asc' },
        },
      },
    });
  }

  async deleteQuestion(req: any, id: string) {
    const user = req.user;

    const existing = await this.prisma.question.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundException('Questão não encontrada');
    }

    await this.logs.audit(`Question deleted ${existing.id}`, user.id);

    return this.prisma.question.delete({ where: { id } });
  }
}
