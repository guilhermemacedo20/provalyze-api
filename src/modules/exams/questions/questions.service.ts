import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateQuestionDto } from './dto/questions.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QuestionType } from '@prisma/client';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(req: any, createQuestion: CreateQuestionDto) {
    // TO-DO: Ajustar para trazer o usuário logado
    const user = await this.prisma.user.findUnique({
      where: { email: req.headers['x-user-email'] },
    });

    if (!user || user.role !== 'TEACHER') {
      throw new UnauthorizedException('Acesso não autorizado');
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
          theme: createQuestion.theme,
          userId: user.id,
        },
      });
    }

    if (createQuestion.type === QuestionType.MULTIPLE_CHOICE) {
      questionCreated = await this.prisma.question.create({
        data: {
          statement: createQuestion.statement,
          type: 'MULTIPLE_CHOICE',
          theme: createQuestion.theme,
          correctOption: createQuestion.correctOption,
          userId: user.id,
          ...(options
            ? { questionOptions: { create: createQuestion.options } }
            : {}),
        },
        include: { questionOptions: true },
      });
    }

    return questionCreated ? questionCreated.id : "Ocorreu um erro ao realizar a criação da questão";
  }
}
