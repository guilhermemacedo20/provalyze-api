import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadQuestionImageDto } from './dto/question-image.dto';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import {
  QUESTION_IMAGE_MAX_BYTES,
  QuestionsService,
} from './questions.service';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const asDataUrl = (bytes: Buffer, type = 'image/png') =>
  `data:${type};base64,${bytes.toString('base64')}`;

describe('QuestionsService', () => {
  const service = new QuestionsService(
    prismaMock as unknown as PrismaService,
    logsMock,
  );
  const request = { user: { id: '1', role: 'TEACHER' } };
  const student = { user: { id: 's1', role: 'STUDENT' } };

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

  it('rejeita imagem que não pertence ao professor', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.questionImage.findFirst.mockResolvedValue(null);

    await expect(
      service.createQuestion(request, {
        statement: 'Observe a figura',
        type: QuestionType.OPEN_ENDED,
        themeId: '1',
        imageUrl: '/questions/images/img-de-outro',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.questionImage.findFirst).toHaveBeenCalledWith({
      where: { id: 'img-de-outro', userId: '1' },
      select: { id: true },
    });
    expect(prismaMock.question.create).not.toHaveBeenCalled();
  });

  it('apaga a imagem antiga quando a questão troca de imagem', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.questionImage.findFirst.mockResolvedValue({ id: 'nova' });
    prismaMock.question.findFirst.mockResolvedValue({
      id: 'q1',
      imageUrl: '/questions/images/antiga',
    });
    prismaMock.question.update.mockResolvedValue({ id: 'q1' });
    prismaMock.question.count.mockResolvedValue(0);

    await service.updateQuestion(request, 'q1', {
      statement: 'Observe a figura',
      type: QuestionType.OPEN_ENDED,
      themeId: '1',
      imageUrl: '/questions/images/nova',
    });

    expect(prismaMock.questionImage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'antiga', userId: '1' },
    });
  });

  it('mantém a imagem quando o campo não é enviado na edição', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.question.findFirst.mockResolvedValue({
      id: 'q1',
      imageUrl: '/questions/images/atual',
    });
    prismaMock.question.update.mockResolvedValue({ id: 'q1' });

    await service.updateQuestion(request, 'q1', {
      statement: 'Observe a figura',
      type: QuestionType.OPEN_ENDED,
      themeId: '1',
    });

    expect(prismaMock.questionImage.deleteMany).not.toHaveBeenCalled();
  });

  it('apaga a imagem ao excluir a questão', async () => {
    prismaMock.question.findFirst.mockResolvedValue({
      id: 'q1',
      imageUrl: '/questions/images/img1',
    });
    prismaMock.examQuestion.count.mockResolvedValue(0);
    prismaMock.question.delete.mockResolvedValue({ id: 'q1' });
    prismaMock.question.count.mockResolvedValue(0);

    await service.deleteQuestion(request, 'q1');

    expect(prismaMock.questionImage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'img1', userId: '1' },
    });
  });

  it('DTO aceita só data URL de PNG ou JPG', async () => {
    const errors = async (image: unknown) =>
      (await validate(plainToInstance(UploadQuestionImageDto, { image })))
        .length;

    expect(await errors(asDataUrl(png))).toBe(0);
    expect(await errors(asDataUrl(png, 'image/jpeg'))).toBe(0);
    expect(await errors(asDataUrl(svg, 'image/svg+xml'))).toBeGreaterThan(0);
    expect(await errors(asDataUrl(png, 'image/gif'))).toBeGreaterThan(0);
    expect(await errors(png.toString('base64'))).toBeGreaterThan(0);
    expect(await errors('data:image/png;base64,%%%')).toBeGreaterThan(0);
    expect(await errors(undefined)).toBeGreaterThan(0);
  });

  it('rejeita imagem acima de 1 MB', async () => {
    const big = Buffer.concat([png, Buffer.alloc(QUESTION_IMAGE_MAX_BYTES)]);
    await expect(service.upload(request, asDataUrl(big))).rejects.toThrow(
      'A imagem deve ter no máximo 1 MB',
    );
  });

  it('grava os bytes (não o base64) e devolve o caminho interno', async () => {
    prismaMock.questionImage.create.mockResolvedValue({ id: 'img1' });

    const result = await service.upload(request, asDataUrl(png));

    expect(prismaMock.questionImage.create).toHaveBeenCalledWith({
      data: { userId: 't1', data: new Uint8Array(png) },
      select: { id: true },
    });
    expect(result).toEqual({ id: 'img1', url: '/questions/images/img1' });
    expect(logsMock.audit).toHaveBeenCalledWith(
      'Question image uploaded img1',
      't1',
    );
  });

  const stored = { userId: 't1', data: new Uint8Array(png) };

  it('retorna 404 quando a imagem não existe', async () => {
    prismaMock.questionImage.findUnique.mockResolvedValue(null);
    await expect(service.getImage(request, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('devolve a data URL para o professor dono', async () => {
    prismaMock.questionImage.findUnique.mockResolvedValue(stored);
    await expect(service.getImage(request, 'img1')).resolves.toEqual({
      id: 'img1',
      image: asDataUrl(png),
    });
    expect(prismaMock.question.count).not.toHaveBeenCalled();
  });

  it('bloqueia outro professor', async () => {
    prismaMock.questionImage.findUnique.mockResolvedValue(stored);
    await expect(
      service.getImage({ user: { id: 't2', role: 'TEACHER' } }, 'img1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('libera para aluno com prova publicada que usa a imagem', async () => {
    prismaMock.questionImage.findUnique.mockResolvedValue(stored);
    prismaMock.question.count.mockResolvedValue(1);

    await expect(service.getImage(student, 'img1')).resolves.toEqual({
      id: 'img1',
      image: asDataUrl(png),
    });
    expect(prismaMock.question.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          imageUrl: '/questions/images/img1',
        }),
      }),
    );
  });

  it('bloqueia aluno sem prova publicada com a imagem', async () => {
    prismaMock.questionImage.findUnique.mockResolvedValue(stored);
    prismaMock.question.count.mockResolvedValue(0);

    await expect(service.getImage(student, 'img1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
