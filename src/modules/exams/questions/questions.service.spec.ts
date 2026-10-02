import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { QuestionsService } from './questions.service';

describe('QuestionsService', () => {
  const service = new QuestionsService(
    prismaMock as unknown as PrismaService,
    logsMock,
  );
  const request = { user: { id: '1', role: 'TEACHER' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create an open-ended question', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.question.create.mockResolvedValue({ id: '1' });

    await service.createQuestion(request, {
      statement: 'Quanto é 2 + 2?',
      type: QuestionType.OPEN_ENDED,
      themeId: '1',
    });

    expect(prismaMock.question.create).toHaveBeenCalledWith({
      data: {
        statement: 'Quanto é 2 + 2?',
        type: 'OPEN_ENDED',
        themeId: '1',
        userId: '1',
      },
    });
  });

  it('should create a multiple-choice question with options', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.question.create.mockResolvedValue({ id: '1' });

    await service.createQuestion(request, {
      statement: 'Quanto é 2 + 2?',
      type: QuestionType.MULTIPLE_CHOICE,
      themeId: '1',
      correctOption: 'A',
      options: [
        { label: 'A', text: '4', isCorrect: true },
        { label: 'B', text: '5', isCorrect: false },
      ],
    });

    expect(prismaMock.question.create).toHaveBeenCalledWith({
      data: {
        statement: 'Quanto é 2 + 2?',
        type: 'MULTIPLE_CHOICE',
        themeId: '1',
        imageUrl: undefined,
        correctOption: 'A',
        userId: '1',
        questionOptions: {
          create: [
            { label: 'A', text: '4', isCorrect: true },
            { label: 'B', text: '5', isCorrect: false },
          ],
        },
      },
      include: { questionOptions: true },
    });
  });

  it('should get a question by id', async () => {
    prismaMock.question.findFirst.mockResolvedValue({
      id: '1',
      statement: 'Quanto é 2 + 2?',
    });

    await expect(service.listQuestion(request, '1')).resolves.toEqual({
      id: '1',
      statement: 'Quanto é 2 + 2?',
    });

    expect(prismaMock.question.findFirst).toHaveBeenCalledWith({
      where: { id: '1', userId: '1' },
      include: { questionOptions: { orderBy: { label: 'asc' } } },
    });
  });

  it('should update a question and replace its options', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.question.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.question.update.mockResolvedValue({ id: '1' });

    await service.updateQuestion(request, '1', {
      statement: 'Quanto é 3 + 3?',
      type: QuestionType.MULTIPLE_CHOICE,
      themeId: 'theme-1',
      correctOption: 'A',
      options: [{ label: 'A', text: '6', isCorrect: true }],
    });

    expect(prismaMock.questionOption.deleteMany).toHaveBeenCalledWith({
      where: { questionId: '1' },
    });
    expect(prismaMock.question.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        statement: 'Quanto é 3 + 3?',
        type: QuestionType.MULTIPLE_CHOICE,
        themeId: 'theme-1',
        correctOption: 'A',
        questionOptions: {
          create: [{ label: 'A', text: '6', isCorrect: true }],
        },
      },
      include: { questionOptions: { orderBy: { label: 'asc' } } },
    });
  });

  it('should delete a question', async () => {
    prismaMock.question.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.question.delete.mockResolvedValue({ id: '1' });

    await service.deleteQuestion(request, '1');

    expect(prismaMock.question.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should filter questions by theme', async () => {
    prismaMock.question.findMany.mockResolvedValue([]);

    await expect(
      service.listQuestions(request, { themeId: '1' }),
    ).resolves.toEqual([]);

    expect(prismaMock.question.findMany).toHaveBeenCalledWith({
      where: { userId: '1', themeId: '1' },
    });
  });

  it('should throw when the theme does not belong to the teacher', async () => {
    prismaMock.theme.findFirst.mockResolvedValue(null);

    const createdQuestion = service.createQuestion(request, {
      statement: 'Quanto é 2 + 2?',
      type: QuestionType.OPEN_ENDED,
      themeId: '1',
    });

    await expect(createdQuestion).rejects.toBeInstanceOf(NotFoundException);
    await expect(createdQuestion).rejects.toThrow(
      'Tema não encontrado para o usuário logado',
    );
    expect(prismaMock.question.create).not.toHaveBeenCalled();
  });

  it('should not delete a question that does not exist', async () => {
    prismaMock.question.findFirst.mockResolvedValue(null);

    const deletedQuestion = service.deleteQuestion(request, '1');

    await expect(deletedQuestion).rejects.toBeInstanceOf(NotFoundException);
    await expect(deletedQuestion).rejects.toThrow('Questão não encontrada');
    expect(prismaMock.question.delete).not.toHaveBeenCalled();
  });

  it('should throw when the question type is not supported', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });

    const createdQuestion = service.createQuestion(request, {
      statement: 'Quanto é 2 + 2?',
      type: 'any' as QuestionType,
      themeId: '1',
    });

    await expect(createdQuestion).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(createdQuestion).rejects.toThrow(
      'Ocorreu um erro ao realizar a criação da questão',
    );
    expect(prismaMock.question.create).not.toHaveBeenCalled();
  });
});
