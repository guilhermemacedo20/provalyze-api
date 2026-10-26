import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ExamEventType,
  ExamStatus,
  GradeStatus,
  QuestionType,
  Role,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { aiMock } from 'src/test/mocks/ai.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { effectiveExamStatus, ExamsService } from './exams.service';

describe('ExamsService', () => {
  const service = new ExamsService(
    prismaMock as unknown as PrismaService,
    logsMock,
    aiMock,
  );

  const teacherReq = {
    user: {
      id: 'teacher-1',
      role: Role.TEACHER,
      email: 'professor@escola.com',
    },
  };

  function buildExamDetail(overrides: Record<string, unknown> = {}) {
    const nextYear = new Date().getFullYear() + 1;

    const startsAt = new Date(`${nextYear}-06-01T10:00:00.000Z`);
    const endsAt = new Date(`${nextYear}-06-01T12:00:00.000Z`);

    return {
      id: 'exam-1',
      title: 'Prova completa',
      status: ExamStatus.DRAFT,
      startsAt,
      endsAt,
      durationMinutes: 60,
      targetScore: 10,
      teacher: { name: 'Prof' },
      examQuestions: [
        {
          id: 'eq-1',
          questionId: 'q-1',
          order: 0,
          points: 10,
          question: {
            statement: 'Enunciado',
            type: QuestionType.MULTIPLE_CHOICE,
            theme: { id: 't-1', name: 'Tema' },
          },
          answers: [{ isCorrect: true }],
        },
      ],
      assignments: [
        {
          class: {
            id: 'class-1',
            name: 'Turma A',
            subject: { name: 'Mat', course: { name: 'Eng' } },
            studentAssignments: [{ userId: 'student-1' }],
          },
        },
      ],
      ...overrides,
    };
  }

  const validSaveDto = {
    title: 'Nova prova',
    startsAt: '2030-06-01T10:00:00.000Z',
    endsAt: '2030-06-01T12:00:00.000Z',
    durationMinutes: 60,
    questions: [{ questionId: 'q-1', points: 10 }],
    classIds: ['class-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-26T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marca prova publicada como encerrada após endsAt', () => {
    expect(
      effectiveExamStatus(
        ExamStatus.PUBLISHED,
        new Date('2020-01-01T12:00:00.000Z'),
        new Date('2025-01-01T00:00:00.000Z'),
      ),
    ).toBe(ExamStatus.ENDED);
  });

  it('mantém status quando ainda dentro do prazo', () => {
    expect(
      effectiveExamStatus(
        ExamStatus.PUBLISHED,
        new Date('2030-06-01T12:00:00.000Z'),
        new Date('2030-06-01T11:00:00.000Z'),
      ),
    ).toBe(ExamStatus.PUBLISHED);
  });

  it('não altera rascunho mesmo após endsAt', () => {
    expect(
      effectiveExamStatus(
        ExamStatus.DRAFT,
        new Date('2020-01-01T12:00:00.000Z'),
        new Date('2025-01-01T00:00:00.000Z'),
      ),
    ).toBe(ExamStatus.DRAFT);
  });

  it('lista provas do professor', async () => {
    const startsAt = new Date('2030-06-01T10:00:00.000Z');
    const endsAt = new Date('2030-06-01T12:00:00.000Z');
    prismaMock.exam.findMany.mockResolvedValue([
      {
        id: 'exam-1',
        title: 'Prova 1',
        status: ExamStatus.DRAFT,
        startsAt,
        endsAt,
        durationMinutes: 60,
        examQuestions: [{ points: 5 }, { points: 5 }],
        assignments: [
          {
            class: {
              id: 'class-1',
              name: 'Turma A',
              subject: { name: 'Matemática', course: { name: 'Engenharia' } },
            },
          },
        ],
      },
    ]);

    const result = await service.listExams(teacherReq);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'exam-1',
      title: 'Prova 1',
      questionsCount: 2,
      totalPoints: 10,
      classes: [
        {
          id: 'class-1',
          name: 'Turma A',
          subjectName: 'Matemática',
          courseName: 'Engenharia',
        },
      ],
    });
    expect(prismaMock.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'teacher-1' },
      }),
    );
  });

  it('getExam lança NotFound quando prova não é do professor', async () => {
    prismaMock.exam.findFirst.mockResolvedValue(null);

    await expect(service.getExam(teacherReq, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('publishExam impede republicação', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      status: ExamStatus.PUBLISHED,
      endsAt: new Date('2030-06-01T12:00:00.000Z'),
      targetScore: 10,
      examQuestions: [{ points: 10 }],
      assignments: [{ id: 'a1' }],
    });

    await expect(
      service.publishExam(teacherReq, 'exam-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deleteExam bloqueia quando há sessões de alunos', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      userId: 'teacher-1',
    });
    prismaMock.examSession.count.mockResolvedValue(2);

    await expect(
      service.deleteExam(teacherReq, 'exam-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.exam.delete).not.toHaveBeenCalled();
  });

  it('deleteExam remove prova sem sessões', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      userId: 'teacher-1',
    });
    prismaMock.examSession.count.mockResolvedValue(0);
    prismaMock.exam.delete.mockResolvedValue({ id: 'exam-1' });

    await expect(service.deleteExam(teacherReq, 'exam-1')).resolves.toEqual({
      id: 'exam-1',
    });
    expect(logsMock.audit).toHaveBeenCalled();
  });

  it('createExam valida período inválido', async () => {
    await expect(
      service.createExam(teacherReq, {
        title: 'Prova',
        startsAt: '2030-06-01T12:00:00.000Z',
        endsAt: '2030-06-01T10:00:00.000Z',
        durationMinutes: 30,
        questions: [],
        classIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getStudentClassExams nega aluno fora da turma', async () => {
    prismaMock.class.findFirst.mockResolvedValue(null);

    await expect(
      service.getStudentClassExams({ user: { id: 'student-1' } }, 'class-x'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('submitExamEvents exige sessão em andamento', async () => {
    prismaMock.class.findFirst.mockResolvedValue({ id: 'class-1' });
    prismaMock.examAssignment.findFirst.mockResolvedValue({
      exam: {
        id: 'exam-1',
        title: 'Prova',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2030-01-01'),
        status: ExamStatus.PUBLISHED,
        durationMinutes: 60,
        targetScore: 10,
      },
    });
    prismaMock.examSession.findFirst.mockResolvedValue({
      id: 'session-1',
      status: SessionStatus.FINISHED,
    });

    await expect(
      service.submitExamEvents(
        { user: { id: 'student-1' } },
        'class-1',
        'exam-1',
        {
          event: {
            examQuestionId: 'eq-1',
            type: ExamEventType.TAB_SWITCH,
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getOverview agrega alunos e estatísticas da prova', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      userId: 'teacher-1',
      examQuestions: [{ id: 'eq-1' }],
      assignments: [
        {
          class: {
            studentAssignments: [
              {
                student: { id: 'student-1', name: 'Ana' },
              },
            ],
          },
        },
      ],
    });
    prismaMock.examSession.findMany.mockResolvedValue([
      {
        userId: 'student-1',
        status: SessionStatus.FINISHED,
        score: 8,
        startedAt: new Date('2030-06-01T10:00:00.000Z'),
        finishedAt: new Date('2030-06-01T11:00:00.000Z'),
        student: { id: 'student-1', name: 'Ana' },
        answers: [{ gradeStatus: GradeStatus.AUTO }],
      },
    ]);

    const overview = await service.getOverview(teacherReq, 'exam-1');

    expect(overview.stats).toMatchObject({
      questionsCount: 1,
      studentsCount: 1,
      average: 8,
      completionRate: 100,
    });
    expect(overview.students[0]).toMatchObject({
      id: 'student-1',
      name: 'Ana',
      score: 8,
    });
  });

  it('gradeAnswer rejeita nota acima do máximo', async () => {
    prismaMock.answer.findFirst.mockResolvedValue({
      id: 'ans-1',
      session: { status: SessionStatus.FINISHED, id: 'session-1' },
      sessionId: 'session-1',
      examQuestion: {
        points: 5,
        question: { type: QuestionType.OPEN_ENDED },
        exam: {
          title: 'Prova',
          targetScore: 10,
          examQuestions: [{ points: 10 }],
        },
      },
    });

    await expect(
      service.gradeAnswer(teacherReq, 'ans-1', { score: 99 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getExam retorna detalhes mapeados', async () => {
    prismaMock.exam.findFirst.mockResolvedValue(buildExamDetail());

    const detail = await service.getExam(teacherReq, 'exam-1');

    expect(detail).toMatchObject({
      id: 'exam-1',
      title: 'Prova completa',
      teacherName: 'Prof',
      studentsCount: 1,
      totalPoints: 10,
      questions: [
        expect.objectContaining({
          examQuestionId: 'eq-1',
          correctRate: 100,
        }),
      ],
    });
  });

  it('publishExam publica rascunho válido', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      status: ExamStatus.DRAFT,
      endsAt: new Date('2030-06-01T12:00:00.000Z'),
      targetScore: 10,
      examQuestions: [{ id: 'eq-1', points: 10 }],
      assignments: [{ id: 'a1' }],
    });
    prismaMock.exam.update.mockResolvedValue(
      buildExamDetail({ status: ExamStatus.PUBLISHED }),
    );

    const result = await service.publishExam(teacherReq, 'exam-1');

    expect(result.status).toBe(ExamStatus.PUBLISHED);
    expect(prismaMock.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exam-1' },
        data: { status: ExamStatus.PUBLISHED },
      }),
    );
  });

  it('publishExam lança NotFound quando prova não existe', async () => {
    prismaMock.exam.findFirst.mockResolvedValue(null);

    await expect(
      service.publishExam(teacherReq, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateExam impede editar prova publicada', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      userId: 'teacher-1',
      status: ExamStatus.PUBLISHED,
      targetScore: 10,
    });

    await expect(
      service.updateExam(teacherReq, 'exam-1', validSaveDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createExam rejeita soma de pontos acima do total', async () => {
    prismaMock.question.findMany.mockResolvedValue({
      questionId: 'q-1',
    });
    prismaMock.teacherAssignment.findMany.mockResolvedValue({
      classId: 'class',
    });
    await expect(
      service.createExam(teacherReq, {
        ...validSaveDto,
        questions: [
          { questionId: 'q-1', points: 6 },
          { questionId: 'q-2', points: 6 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createExam rejeita turma que não pertence ao professor', async () => {
    prismaMock.question.findMany.mockResolvedValue([{ id: 'q-1' }]);
    prismaMock.teacherAssignment.findMany.mockResolvedValue([]);

    await expect(
      service.createExam(teacherReq, validSaveDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createExam persiste rascunho', async () => {
    prismaMock.question.findMany.mockResolvedValue([{ id: 'q-1' }]);
    prismaMock.teacherAssignment.findMany.mockResolvedValue([
      { classId: 'class-1' },
    ]);
    prismaMock.exam.create.mockResolvedValue(buildExamDetail());

    const created = await service.createExam(teacherReq, validSaveDto);

    expect(created.id).toBe('exam-1');
    expect(prismaMock.exam.create).toHaveBeenCalled();
    expect(logsMock.audit).toHaveBeenCalledWith(
      expect.stringContaining('Exam created'),
      'teacher-1',
    );
  });

  it('createExam rejeita duração maior que janela de aplicação', async () => {
    await expect(
      service.createExam(teacherReq, {
        ...validSaveDto,
        durationMinutes: 180,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getStudentClassExams lista provas da turma', async () => {
    const startsAt = new Date('2020-01-01T10:00:00.000Z');
    const endsAt = new Date('2030-06-01T12:00:00.000Z');
    prismaMock.class.findFirst.mockResolvedValue({
      id: 'class-1',
      name: 'Turma A',
      subject: { name: 'Mat', course: { name: 'Eng' } },
      examAssignments: [
        {
          exam: {
            id: 'exam-1',
            title: 'Prova 1',
            status: ExamStatus.PUBLISHED,
            startsAt,
            endsAt,
            durationMinutes: 60,
            targetScore: 10,
            sessions: [],
          },
        },
      ],
    });

    const result = await service.getStudentClassExams(
      { user: { id: 'student-1' } },
      'class-1',
    );

    expect(result.exams).toHaveLength(1);
    expect(result.exams[0]).toMatchObject({
      id: 'exam-1',
      title: 'Prova 1',
      status: 'PUBLISHED',
      available: true,
    });
  });

  it('submitExamEvents registra evento de integridade', async () => {
    prismaMock.class.findFirst.mockResolvedValue({ id: 'class-1' });
    prismaMock.examAssignment.findFirst.mockResolvedValue({
      exam: {
        id: 'exam-1',
        title: 'Prova',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2030-01-01'),
        status: ExamStatus.PUBLISHED,
        durationMinutes: 60,
        targetScore: 10,
      },
    });
    prismaMock.examSession.findFirst.mockResolvedValue({
      id: 'session-1',
      status: SessionStatus.STARTED,
    });
    prismaMock.examQuestion.findFirst.mockResolvedValue({
      id: 'eq-1',
      questionId: 'q-1',
    });
    prismaMock.examEvent.findFirst.mockResolvedValue(null);
    prismaMock.examEvent.create.mockResolvedValue({
      id: 'ev-1',
      type: ExamEventType.TAB_SWITCH,
      examQuestionId: 'eq-1',
    });

    const result = await service.submitExamEvents(
      { user: { id: 'student-1' } },
      'class-1',
      'exam-1',
      {
        event: { examQuestionId: 'eq-1', type: ExamEventType.TAB_SWITCH },
      },
    );

    expect(result).toEqual({ id: 'ev-1', type: ExamEventType.TAB_SWITCH });
    expect(logsMock.audit).toHaveBeenCalled();
  });

  it('submitExamEvents retorna evento duplicado sem recriar', async () => {
    prismaMock.class.findFirst.mockResolvedValue({ id: 'class-1' });
    prismaMock.examAssignment.findFirst.mockResolvedValue({
      exam: {
        id: 'exam-1',
        title: 'Prova',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2030-01-01'),
        status: ExamStatus.PUBLISHED,
        durationMinutes: 60,
        targetScore: 10,
      },
    });
    prismaMock.examSession.findFirst.mockResolvedValue({
      id: 'session-1',
      status: SessionStatus.STARTED,
    });
    prismaMock.examQuestion.findFirst.mockResolvedValue({
      id: 'eq-1',
      questionId: 'q-1',
    });
    prismaMock.examEvent.findFirst.mockResolvedValue({
      id: 'ev-old',
      type: ExamEventType.TAB_SWITCH,
      examQuestionId: 'eq-1',
    });

    const result = await service.submitExamEvents(
      { user: { id: 'student-1' } },
      'class-1',
      'exam-1',
      {
        event: { examQuestionId: 'eq-1', type: ExamEventType.TAB_SWITCH },
      },
    );

    expect(result.message).toContain('já registrado');
    expect(prismaMock.examEvent.create).not.toHaveBeenCalled();
  });

  it('aiValidateQuestion retorna sugestão em cache', async () => {
    prismaMock.answer.findFirst.mockResolvedValue({
      id: 'ans-1',
      content: 'Resposta',
      aiJustification: 'Ok',
      aiSuggestedScore: 8,
      sessionId: 's1',
      examQuestionId: 'eq-1',
      examQuestion: {
        points: 10,
        question: {
          type: QuestionType.OPEN_ENDED,
          statement: 'Dissertativa',
          theme: { name: 'Tema' },
        },
        exam: {
          targetScore: 10,
          examQuestions: [{ points: 10 }],
        },
      },
    });
    prismaMock.exam.findFirst.mockResolvedValue({ id: 'exam-1' });

    await expect(
      service.aiValidateQuestion({ user: { id: 'teacher-1' } }, 'ans-1'),
    ).resolves.toEqual({
      suggestedScore: 8,
      justification: 'Ok',
      maxScore: 10,
    });
    expect(aiMock.suggestAnswerScore).not.toHaveBeenCalled();
  });

  it('gradeAnswer atualiza nota e total da sessão', async () => {
    prismaMock.answer.findFirst.mockResolvedValue({
      id: 'ans-1',
      sessionId: 'session-1',
      session: { status: SessionStatus.FINISHED, id: 'session-1' },
      examQuestion: {
        points: 10,
        question: { type: QuestionType.OPEN_ENDED },
        exam: {
          title: 'Prova',
          targetScore: 10,
          examQuestions: [{ points: 10 }],
        },
      },
    });
    prismaMock.answer.update.mockResolvedValue({});
    prismaMock.answer.findMany.mockResolvedValue([{ score: 7 }]);
    prismaMock.examSession.update.mockResolvedValue({});

    const result = await service.gradeAnswer(teacherReq, 'ans-1', {
      score: 7,
      feedback: 'Bom',
    });

    expect(result).toMatchObject({
      answerId: 'ans-1',
      score: 7,
      sessionScore: 7,
      gradeStatus: GradeStatus.TEACHER_APPROVED,
      teacherFeedback: 'Bom',
    });
  });

  it('getCorrection monta gabarito do aluno', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      title: 'Prova',
      targetScore: 10,
      userId: 'teacher-1',
      examQuestions: [
        {
          id: 'eq-1',
          order: 0,
          points: 10,
          question: {
            type: QuestionType.MULTIPLE_CHOICE,
            statement: '2+2?',
            theme: { name: 'Aritmética' },
            correctOption: 'A',
            questionOptions: [{ label: 'A', text: '4' }],
          },
        },
      ],
    });
    prismaMock.examSession.findUnique.mockResolvedValue({
      score: 10,
      status: SessionStatus.FINISHED,
      startedAt: new Date('2030-06-01T10:00:00.000Z'),
      finishedAt: new Date('2030-06-01T10:30:00.000Z'),
      student: { id: 'student-1', name: 'Ana' },
      answers: [
        {
          id: 'ans-1',
          examQuestionId: 'eq-1',
          content: 'A',
          isCorrect: true,
          score: 10,
          gradeStatus: GradeStatus.AUTO,
          aiSuggestedScore: null,
          aiJustification: null,
          teacherFeedback: null,
        },
      ],
      events: [],
    });

    const correction = await service.getCorrection(
      teacherReq,
      'exam-1',
      'student-1',
    );

    expect(correction.student.name).toBe('Ana');
    expect(correction.questions[0]).toMatchObject({
      number: 1,
      isCorrect: true,
      maxScore: 10,
    });
  });

  it('submitExam corrige questão objetiva e finaliza sessão', async () => {
    const startedAt = new Date();
    const startsAt = new Date('2020-01-01T10:00:00.000Z');
    const endsAt = new Date('2030-06-01T12:00:00.000Z');
    prismaMock.class.findFirst.mockResolvedValue({ id: 'class-1' });
    prismaMock.examAssignment.findFirst.mockResolvedValue({
      exam: {
        id: 'exam-1',
        title: 'Prova',
        startsAt,
        endsAt,
        status: ExamStatus.PUBLISHED,
        durationMinutes: 60,
        targetScore: 10,
      },
    });
    prismaMock.examSession.findFirst.mockResolvedValue({
      id: 'session-1',
      status: SessionStatus.STARTED,
      startedAt,
    });
    prismaMock.examQuestion.findMany.mockResolvedValue([
      {
        id: 'eq-1',
        questionId: 'q-1',
        order: 0,
        points: 10,
        question: {
          type: QuestionType.MULTIPLE_CHOICE,
          correctOption: 'A',
          statement: '2+2?',
          theme: { name: 'Aritmética' },
          questionOptions: [{ id: 'opt-1', label: 'A', text: '4' }],
        },
      },
    ]);
    prismaMock.answer.createMany.mockResolvedValue({ count: 1 });
    prismaMock.examSession.update.mockResolvedValue({});

    const result = await service.submitExam(
      { user: { id: 'student-1' } },
      'class-1',
      'exam-1',
      {
        answers: [{ examQuestionId: 'eq-1', optionId: 'opt-1' }],
      },
    );

    expect(result).toHaveProperty('status', SessionStatus.FINISHED);

    if ('status' in result) {
      expect(result.status).toBe(SessionStatus.FINISHED);
      expect(result.score).toBe(10);
      expect(result.questions[0]).toMatchObject({
        isCorrect: true,
        gradeStatus: GradeStatus.AUTO,
      });
    }

    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('submitExam retorna indisponibilidade', async () => {
    const startedAt = new Date();
    const startsAt = new Date('2020-01-01T10:00:00.000Z');
    const endsAt = new Date('2026-06-01T12:00:00.000Z');
    prismaMock.class.findFirst.mockResolvedValue({ id: 'class-1' });
    prismaMock.examAssignment.findFirst.mockResolvedValue({
      exam: {
        id: 'exam-1',
        title: 'Prova',
        startsAt,
        endsAt,
        status: ExamStatus.PUBLISHED,
        durationMinutes: 60,
        targetScore: 10,
      },
    });
    prismaMock.examSession.findFirst.mockResolvedValue({
      id: 'session-1',
      status: SessionStatus.STARTED,
      startedAt,
    });
    prismaMock.examQuestion.findMany.mockResolvedValue([
      {
        id: 'eq-1',
        questionId: 'q-1',
        order: 0,
        points: 10,
        question: {
          type: QuestionType.MULTIPLE_CHOICE,
          correctOption: 'A',
          statement: '2+2?',
          theme: { name: 'Aritmética' },
          questionOptions: [{ id: 'opt-1', label: 'A', text: '4' }],
        },
      },
    ]);
    prismaMock.answer.createMany.mockResolvedValue({ count: 1 });
    prismaMock.examSession.update.mockResolvedValue({});

    const result = await service.submitExam(
      { user: { id: 'student-1' } },
      'class-1',
      'exam-1',
      {
        answers: [{ examQuestionId: 'eq-1', optionId: 'opt-1' }],
      },
    );

    expect(result).not.toHaveProperty('status', SessionStatus.FINISHED);

    if ('available' in result) {
      expect(result.available).toBe(false);
      expect(result.endsAt).toBe(endsAt);
    }
  });

  it('getCorrection exige prova entregue', async () => {
    prismaMock.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      title: 'Prova',
      targetScore: 10,
      userId: 'teacher-1',
      examQuestions: [],
    });
    prismaMock.examSession.findUnique.mockResolvedValue({
      status: SessionStatus.STARTED,
      student: { id: 'student-1', name: 'Ana' },
      answers: [],
      events: [],
    });

    await expect(
      service.getCorrection(teacherReq, 'exam-1', 'student-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
