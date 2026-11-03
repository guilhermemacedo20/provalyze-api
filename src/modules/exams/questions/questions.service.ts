import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateQuestionDto, ListQuestionsDto } from './dto/questions.dto';
import { ExamStatus, QuestionType, Role } from '@prisma/client';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';

export const QUESTION_IMAGE_MAX_BYTES = 1024 * 1024;
const QUESTION_IMAGE_PATH = '/questions/images/';

function questionImagePath(id: string) {
  return `${QUESTION_IMAGE_PATH}${id}`;
}

function imageIdFromUrl(url?: string | null) {
  return url ? url.slice(QUESTION_IMAGE_PATH.length) : null;
}

function toDataUrl(bytes: Uint8Array) {
  const type = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg';
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
}

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

    await this.assertOwnedImage(user.id, createQuestion.imageUrl);

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

    const questionInExam = await this.prisma.examQuestion.findFirst({
      where: { questionId: question.id },
      select: { id: true },
    });

    return { ...question, inExam: !!questionInExam };
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

    const usedInExam = await this.prisma.examQuestion.count({
      where: { questionId: id },
    });

    if (usedInExam > 0) {
      throw new ConflictException(
        'Essa questão está em uma prova e não pode ser editada',
      );
    }

    await this.assertOwnedImage(user.id, updateQuestionDto.imageUrl);

    const isMultiple = updateQuestionDto.type === QuestionType.MULTIPLE_CHOICE;
    const options = updateQuestionDto.options ?? [];

    await this.prisma.questionOption.deleteMany({ where: { questionId: id } });

    await this.logs.audit(`Question updated ${existing.id}`, user.id);

    const updated = await this.prisma.question.update({
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

    if (
      updateQuestionDto.imageUrl !== undefined &&
      updateQuestionDto.imageUrl !== existing.imageUrl
    ) {
      await this.removeImageIfUnused(user.id, existing.imageUrl);
    }

    return updated;
  }

  async deleteQuestion(req: any, id: string) {
    const user = req.user;

    const existing = await this.prisma.question.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      throw new NotFoundException('Questão não encontrada');
    }

    const usedInExam = await this.prisma.examQuestion.count({
      where: { questionId: id },
    });

    if (usedInExam > 0) {
      throw new ConflictException(
        'Essa questão está em uma prova e não pode ser excluída',
      );
    }

    await this.logs.audit(`Question deleted ${existing.id}`, user.id);

    const deleted = await this.prisma.question.delete({ where: { id } });
    await this.removeImageIfUnused(user.id, existing.imageUrl);
    return deleted;
  }

  async upload(req: any, image: string) {
    const user = req.user;

    const bytes = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');

    if (bytes.length > QUESTION_IMAGE_MAX_BYTES) {
      throw new BadRequestException('A imagem deve ter no máximo 1 MB');
    }

    const imageSaved = await this.prisma.questionImage.create({
      data: { userId: user.id, data: new Uint8Array(bytes) },
      select: { id: true },
    });

    await this.logs.audit(`Question image uploaded ${imageSaved.id}`, user.id);

    return { id: imageSaved.id, url: questionImagePath(imageSaved.id) };
  }

  async getImage(req: any, id: string) {
    const user = req.user;
    const image = await this.prisma.questionImage.findUnique({
      where: { id },
      select: { userId: true, data: true },
    });

    if (!image) {
      throw new NotFoundException('Imagem não encontrada');
    }

    if (image.userId === user.id) {
      return { id, image: toDataUrl(image.data) };
    }

    if (user.role === Role.STUDENT) {
      const allowed = await this.prisma.question.count({
        where: {
          imageUrl: questionImagePath(id),
          examQuestions: {
            some: {
              exam: {
                status: { not: ExamStatus.DRAFT },
                assignments: {
                  some: {
                    class: {
                      studentAssignments: {
                        some: { userId: user.id, endedAt: null },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (allowed > 0) {
        return { id, image: toDataUrl(image.data) };
      }
    }

    throw new NotFoundException('Imagem não encontrada');
  }

  private async assertOwnedImage(userId: string, imageUrl?: string | null) {
    const imageId = imageIdFromUrl(imageUrl);
    if (!imageId) {
      return;
    }

    const image = await this.prisma.questionImage.findFirst({
      where: { id: imageId, userId },
      select: { id: true },
    });

    if (!image) {
      throw new BadRequestException('Imagem não encontrada.');
    }
  }

  private async removeImageIfUnused(userId: string, imageUrl?: string | null) {
    const imageId = imageIdFromUrl(imageUrl);
    if (!imageId) {
      return;
    }

    const stillUsed = await this.prisma.question.count({
      where: { imageUrl: questionImagePath(imageId) },
    });

    if (stillUsed > 0) {
      return;
    }

    await this.prisma.questionImage.deleteMany({
      where: { id: imageId, userId },
    });
  }
}
