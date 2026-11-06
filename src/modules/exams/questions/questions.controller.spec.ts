import { QuestionType } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

describe('QuestionsController', () => {
  const controller = new QuestionsController(
    new QuestionsService(prismaMock as unknown as PrismaService, logsMock),
  );
  const request = { user: { id: '1', role: 'TEACHER' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a question', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.question.create.mockResolvedValue({ id: '1' });

    const result = await controller.createQuestion(request, {
      statement: 'Quanto é 2 + 2?',
      type: QuestionType.OPEN_ENDED,
      themeId: '1',
    });

    expect(result).toEqual({ id: '1' });
    expect(prismaMock.question.create).toHaveBeenCalledWith({
      data: {
        statement: 'Quanto é 2 + 2?',
        type: 'OPEN_ENDED',
        imageUrl: undefined,
        themeId: '1',
        userId: '1',
      },
    });
  });

});
