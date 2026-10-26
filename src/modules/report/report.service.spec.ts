import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ReportAnalysisType, Role } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { aiMock } from 'src/test/mocks/ai.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { ReportService } from './report.service';

describe('ReportService', () => {
  const service = new ReportService(
    prismaMock as unknown as PrismaService,
    aiMock,
    logsMock,
  );

  const teacherReq = {
    user: { id: '1', role: Role.TEACHER, email: 'professor@escola.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('information retorna para admin', async () => {
    prismaMock.user.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(80);
    prismaMock.class.count.mockResolvedValue(5);
    prismaMock.exam.count.mockResolvedValue(20);
    prismaMock.examSession.count.mockResolvedValue(15);
    prismaMock.examSession.aggregate.mockResolvedValue({
      _avg: { score: 7.5 },
    });

    const result = await service.dashInformation({
      user: { id: '1', role: Role.ADMIN },
    });

    expect(result).toEqual({
      role: Role.ADMIN,
      totalUsers: 100,
      totalTeachers: 10,
      totalStudents: 80,
      totalClasses: 5,
      totalExams: 20,
      completedExams: 15,
      totalAverage: 7.5,
    });
  });

  it('information retorna métricas para professor', async () => {
    prismaMock.exam.count.mockResolvedValue(3);
    prismaMock.examSession.aggregate.mockResolvedValue({
      _avg: { score: 8 },
    });
    prismaMock.answer.groupBy.mockResolvedValue([
      { isCorrect: true, _count: { _all: 7 } },
      { isCorrect: false, _count: { _all: 3 } },
    ]);

    const result = await service.dashInformation(teacherReq);

    expect(result).toEqual({
      role: Role.TEACHER,
      totalExams: 3,
      totalAverage: 8,
      hitRate: 70,
    });
  });

  it('information retorna métricas para aluno', async () => {
    prismaMock.examSession.count.mockResolvedValue(2);
    prismaMock.exam.count.mockResolvedValue(1);
    prismaMock.examSession.aggregate.mockResolvedValue({
      _avg: { score: 6.2 },
    });

    const result = await service.dashInformation({
      user: { id: '1', role: Role.STUDENT },
    });

    expect(result).toEqual({
      role: Role.STUDENT,
      upcomingExams: 1,
      finishedExams: 2,
      totalAverage: 6.2,
    });
  });

  it('classAnalytics nega turma fora do escopo do professor', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);

    await expect(
      service.classAnalytics(teacherReq, 'class'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('classAnalytics calcula média e temas', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.exam.findMany.mockResolvedValue([
      { id: 'exam-1', title: 'Prova 1', targetScore: 10 },
    ]);
    prismaMock.examSession.findMany.mockResolvedValue([
      { id: 'session-1', score: 8 },
      { id: 'session-2', score: 6 },
    ]);
    prismaMock.answer.findMany.mockResolvedValue([
      {
        isCorrect: true,
        score: 2,
        examQuestion: {
          points: 2,
          question: { theme: { name: 'Lógica' } },
        },
      },
      {
        isCorrect: false,
        score: 0,
        examQuestion: {
          points: 2,
          question: { theme: { name: 'Lógica' } },
        },
      },
    ]);

    const result = await service.classAnalytics(teacherReq, 'class-1');

    expect(result.average).toBe(7);
    expect(result.median).toBe(7);
    expect(result.hitRate).toBe(50);
    expect(result.themes).toEqual([{ name: 'Lógica', percent: 50 }]);
    expect(result.exams).toHaveLength(1);
  });

  it('gapAnalytics retorna lista vazia sem dados', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.exam.findMany.mockResolvedValue([]);

    await expect(service.gapAnalytics(teacherReq, 'class-1')).resolves.toEqual(
      [],
    );
    expect(aiMock.analyseClassTheme).not.toHaveBeenCalled();
  });

  it('createPedagogicalReport nega turma não vinculada', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);

    await expect(
      service.createPedagogicalReport(teacherReq, {
        classId: 'class-x',
        analysisType: ReportAnalysisType.PERFORMANCE,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('createPedagogicalReport persiste relatório de desempenho', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.exam.findMany.mockResolvedValue([]);
    prismaMock.pedagogicalReport.create.mockResolvedValue({
      id: 'report-1',
      title: 'Mat',
      classId: 'class-1',
      authorId: 'teacher-1',
      analysisType: ReportAnalysisType.PERFORMANCE,
      createdAt: new Date('2026-01-01'),
      author: { name: 'Prof' },
      content: {},
    });

    const result = await service.createPedagogicalReport(teacherReq, {
      classId: 'class-1',
      analysisType: ReportAnalysisType.PERFORMANCE,
    });

    expect(result.id).toBe('report-1');
    expect(result.content).toMatchObject({
      average: null,
      median: null,
      hitRate: null,
      themes: [],
      students: [],
      gaps: [],
    });
    expect(prismaMock.pedagogicalReport.create).toHaveBeenCalled();
    expect(logsMock.audit).toHaveBeenCalled();
  });

  it('getPedagogicalReport lança NotFound quando inexistente', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.pedagogicalReport.findFirst.mockResolvedValue(null);

    await expect(
      service.getPedagogicalReport(teacherReq, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletePedagogicalReport remove relatório do autor', async () => {
    prismaMock.pedagogicalReport.findFirst.mockResolvedValue({
      id: 'report-1',
      authorId: 'teacher-1',
    });
    prismaMock.pedagogicalReport.delete.mockResolvedValue({ id: 'report-1' });

    await expect(
      service.deletePedagogicalReport(teacherReq, 'report-1'),
    ).resolves.toEqual({
      report: 'report-1',
      message: 'Excluido com sucesso',
    });
  });

  it('studentAnalytics impede aluno de ver outro aluno', async () => {
    await expect(
      service.studentAnalytics(
        { user: { id: 'student-1', role: Role.STUDENT } },
        'class-1',
        'student-2',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('classAnalytics nega exame fora do escopo', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.exam.findMany.mockResolvedValue([
      { id: 'exam-1', title: 'Prova 1', targetScore: 10 },
    ]);

    await expect(
      service.classAnalytics(teacherReq, 'class-1', 'exam-x'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('classAnalytics retorna vazio quando professor não tem turmas', async () => {
    prismaMock.class.findMany.mockResolvedValue([]);

    const result = await service.classAnalytics(teacherReq);

    expect(result).toMatchObject({
      average: null,
      median: null,
      hitRate: null,
      themes: [],
      classes: [],
      exams: [],
    });
  });

  it('gapAnalytics falha quando IA não responde', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.exam.findMany.mockResolvedValue([
      {
        title: 'Prova 1',
        targetScore: 10,
        examQuestions: [
          {
            points: 2,
            question: {
              statement: 'Enunciado',
              theme: { name: 'Lógica' },
            },
            answers: [
              {
                content: 'errado',
                isCorrect: false,
                score: 0,
              },
            ],
          },
        ],
      },
    ]);
    (aiMock.analyseClassTheme as jest.Mock).mockResolvedValue(null);

    await expect(
      service.gapAnalytics(teacherReq, 'class-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listPedagogicalReports retorna vazio sem turmas', async () => {
    prismaMock.class.findMany.mockResolvedValue([]);

    await expect(service.listPedagogicalReports(teacherReq)).resolves.toEqual(
      [],
    );
  });

  it('listPedagogicalReports mapeia relatórios do autor', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.pedagogicalReport.findMany.mockResolvedValue([
      {
        id: 'report-1',
        title: 'Mat',
        classId: 'class-1',
        createdAt: new Date('2026-01-01'),
        author: { name: 'Prof' },
        analysisType: ReportAnalysisType.GAPS,
      },
    ]);
    prismaMock.class.findFirst.mockResolvedValue({ name: 'Turma A' });

    const list = await service.listPedagogicalReports(teacherReq, 'class-1');

    expect(list).toEqual([
      {
        id: 'report-1',
        title: 'Mat',
        className: 'Turma A',
        createdAt: new Date('2026-01-01'),
        authorName: 'Prof',
        analysisType: ReportAnalysisType.GAPS,
      },
    ]);
  });

  it('getPedagogicalReport retorna conteúdo completo', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'class-1', name: 'Turma A', subject: { name: 'Mat' } },
    ]);
    prismaMock.pedagogicalReport.findFirst.mockResolvedValue({
      id: 'report-1',
      title: 'Mat',
      classId: 'class-1',
      analysisType: ReportAnalysisType.BOTH,
      createdAt: new Date('2026-01-01'),
      content: { average: 8, gaps: [] },
      author: { name: 'Prof' },
    });
    prismaMock.class.findFirst.mockResolvedValue({
      name: 'Turma A',
      subject: { name: 'Mat' },
    });

    const report = await service.getPedagogicalReport(teacherReq, 'report-1');

    expect(report).toMatchObject({
      id: 'report-1',
      className: 'Turma A',
      subjectName: 'Mat',
      authorName: 'Prof',
      content: { average: 8, gaps: [] },
    });
  });

  it('studentAnalytics retorna painel do aluno', async () => {
    prismaMock.class.findFirst.mockResolvedValue({
      name: 'Turma A',
      subject: { name: 'Mat' },
      studentAssignments: [
        { student: { name: 'Ana', email: 'ana@escola.com' } },
      ],
    });
    prismaMock.examSession.aggregate.mockResolvedValue({
      _avg: { score: 8.5 },
    });
    prismaMock.examSession.findMany.mockResolvedValue([
      {
        score: 8.5,
        finishedAt: new Date('2026-03-01'),
        exam: { title: 'Prova 1' },
      },
    ]);
    prismaMock.answer.findMany.mockResolvedValue([
      {
        score: 2,
        examQuestion: {
          points: 2,
          question: { theme: { name: 'Lógica' } },
        },
      },
    ]);

    const analytics = await service.studentAnalytics(
      teacherReq,
      'class-1',
      'student-1',
    );

    expect(analytics).toMatchObject({
      studentName: 'Ana',
      className: 'Turma A',
      totalAverage: 8.5,
      finishedExams: 1,
      themes: [{ name: 'Lógica', percent: 100 }],
    });
  });

  it('studentThemeAnalysis retorna análise da IA', async () => {
    prismaMock.class.findFirst.mockResolvedValue({
      name: 'Turma A',
      subject: { name: 'Mat' },
      studentAssignments: [
        { student: { name: 'Ana', email: 'ana@escola.com' } },
      ],
    });
    prismaMock.examSession.aggregate.mockResolvedValue({
      _avg: { score: 7 },
    });
    prismaMock.examSession.findMany.mockResolvedValue([
      {
        score: 7,
        finishedAt: new Date('2026-03-01'),
        exam: { title: 'Prova 1' },
      },
    ]);
    prismaMock.answer.findMany.mockResolvedValue([
      {
        score: 1,
        examQuestion: {
          points: 2,
          question: { theme: { name: 'Lógica' } },
        },
      },
    ]);
    (aiMock.analyzeStudentThemes as jest.Mock).mockResolvedValue({
      recommendation: 'Precisa reforçar lógica',
      themes: [{ name: 'Lógica', focus: 'Operadores' }],
    });

    const analysis = await service.studentThemeAnalysis(
      teacherReq,
      'class-1',
      'student-1',
    );

    expect(analysis.recommendation).toContain('reforçar');
    expect(aiMock.analyzeStudentThemes).toHaveBeenCalled();
  });

  it('studentThemeAnalysis falha sem temas', async () => {
    prismaMock.class.findFirst.mockResolvedValue({
      name: 'Turma A',
      subject: { name: 'Mat' },
      studentAssignments: [{ student: { name: 'Ana', email: 'a@x.com' } }],
    });
    prismaMock.examSession.aggregate.mockResolvedValue({
      _avg: { score: null },
    });
    prismaMock.examSession.findMany.mockResolvedValue([]);
    prismaMock.answer.findMany.mockResolvedValue([]);

    await expect(
      service.studentThemeAnalysis(
        {
          user: { id: 'teacher-1', role: Role.TEACHER },
        },
        'class-1',
        'student-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
