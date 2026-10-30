import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ExamStatus,
  GradeStatus,
  Prisma,
  QuestionType,
  ReportAnalysisType,
  Role,
  SessionStatus,
} from '@prisma/client';
import { AIService } from 'src/infra/ai/ai.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { CreatePedagogicalReportDto } from './dto/create-pedagogical-report.dto';
import { LogsService } from 'src/infra/logs/logs.service';
import { DashboardQueryDto } from './dto/dashboard.dto';

type ReportContent = {
  average: number | null;
  median: number | null;
  hitRate: number | null;
  themes: { name: string; percent: number }[];
  students: {
    name: string;
    exams: { title: string; score: number | null }[];
  }[];
  gaps: {
    theme: string;
    percent: number;
    evidence: string;
    suggestion: string;
  }[];
};

function roundScore(value: number | null) {
  if (!value) return null;
  return Math.round(value * 100) / 100;
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Math.round(value * 10) / 10;
}

const fullyGradedSession = {
  status: SessionStatus.FINISHED,
  answers: {
    some: {},
    none: { gradeStatus: GradeStatus.PENDING },
  },
};

const MAX_EXAMS_IN_CHART = 12;
const TIME_ZONE = 'America/Sao_Paulo';

type DashboardPeriodRange = {
  from: Date | null;
  to: Date | null;
};
type Outcomes = { correct: number; wrong: number; pending: number };
type ExamStats = {
  examId: string;
  title: string;
  hasPending: boolean;
  scores: number[];
  questions: Map<string, Outcomes & { order: number; theme: string }>;
};

const pad = (value: number) => String(value).padStart(2, '0');

export function resolvePeriod(
  query: DashboardQueryDto,
  now = new Date(),
): DashboardPeriodRange {
  const today = now.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

  if (query.period === 'year') {
    const year = Number(query.year ?? today.slice(0, 4));
    return {
      from: new Date(`${year}-01-01T00:00:00-03:00`),
      to: new Date(`${year + 1}-01-01T00:00:00-03:00`),
    };
  }

  if (query.period === 'month') {
    const [year, month] = (query.month ?? today.slice(0, 7))
      .split('-')
      .map(Number);
    const from = new Date(`${year}-${pad(month)}-01T00:00:00-03:00`);
    const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
    return {
      from,
      to: new Date(`${next}-01T00:00:00-03:00`),
    };
  }

  return { from: null, to: null };
}

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly logs: LogsService,
  ) {}

  async dashInformation(req: any, query: DashboardQueryDto = {}) {
    const user = req.user;
    const isAdmin = user.role === Role.ADMIN || user.role === Role.COORDINATOR;
    const isTeacher = user.role === Role.TEACHER;
    const isStudent = user.role === Role.STUDENT;

    if (!isAdmin && !isTeacher && !isStudent) {
      throw new NotFoundException('Dashboard information not found');
    }

    const classes = await this.prisma.class.findMany({
      where: isTeacher
        ? { teacherAssignments: { some: { userId: user.id, endedAt: null } } }
        : isStudent
          ? { studentAssignments: { some: { userId: user.id, endedAt: null } } }
          : {},
      select: {
        id: true,
        name: true,
        subject: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const { classId, subjectId } = query;
    if (classId && !classes.some((c) => c.id === classId)) {
      throw new ForbiddenException('Você não tem acesso a essa turma');
    }
    if (subjectId && !classes.some((c) => c.subject.id === subjectId)) {
      throw new ForbiddenException('Você não tem acesso a essa matéria');
    }

    const period = resolvePeriod(query);

    const sessions: Prisma.ExamSessionWhereInput = {
      status: SessionStatus.FINISHED,
      ...(period.from && period.to
        ? { finishedAt: { gte: period.from, lt: period.to } }
        : {}),
      ...(isStudent ? { userId: user.id } : {}),
      ...(classId && !isStudent
        ? { student: { studentAssignments: { some: { classId } } } }
        : {}),
      exam: {
        ...(isTeacher ? { userId: user.id } : {}),
        ...(classId || subjectId
          ? {
              assignments: {
                some: {
                  ...(classId ? { classId } : {}),
                  ...(subjectId ? { class: { subjectId } } : {}),
                },
              },
            }
          : {}),
      },
    };

    const [cards, charts] = await Promise.all([
      isAdmin
        ? this.adminDashboard(sessions)
        : isTeacher
          ? this.teacherDashboard(user.id, period, sessions, classId)
          : this.studentDashboard(user.id, sessions, classId, subjectId),
      this.dashboardCharts(sessions, query.period === 'month'),
    ]);

    return {
      ...cards,
      ...charts,
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        subjectId: c.subject.id,
        subjectName: c.subject.name,
      })),
    };
  }

  async classAnalytics(req: any, classId?: string, examId?: string) {
    const user = req.user;

    const classes = await this.prisma.class.findMany({
      where:
        user.role === Role.TEACHER
          ? {
              teacherAssignments: {
                some: { userId: user.id, endedAt: null },
              },
            }
          : {},
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
      },
    });

    if (classId && !classes.find((schoolClass) => schoolClass.id === classId)) {
      throw new UnauthorizedException(
        'Usuário não possui permissão para visualizar esse analytics',
      );
    }

    const classIds = classes.map((schoolClass) => schoolClass.id);
    const exams =
      classIds.length > 0
        ? await this.prisma.exam.findMany({
            where: {
              status: { in: [ExamStatus.PUBLISHED, ExamStatus.ENDED] },
              ...(user.role === Role.TEACHER ? { userId: user.id } : {}),
              assignments: {
                some: { classId: classId || { in: classIds } },
              },
            },
            select: { id: true, title: true, targetScore: true },
          })
        : [];

    if (examId && !exams.some((exam) => exam.id === examId)) {
      throw new UnauthorizedException(
        'Usuário não possui permissão para visualizar esse analytics',
      );
    }

    const examIds = examId ? [examId] : exams.map((exam) => exam.id);
    const sessions =
      examIds.length > 0
        ? await this.prisma.examSession.findMany({
            where: {
              ...fullyGradedSession,
              exam: {
                id: { in: examIds },
                assignments: {
                  some: { classId: classId ?? { in: classIds } },
                },
              },
            },
            select: { id: true, score: true },
          })
        : [];

    const answers =
      sessions.length > 0
        ? await this.prisma.answer.findMany({
            where: { sessionId: { in: sessions.map((session) => session.id) } },
            select: {
              isCorrect: true,
              score: true,
              examQuestion: {
                select: {
                  points: true,
                  question: { select: { theme: { select: { name: true } } } },
                },
              },
            },
          })
        : [];

    const scores = sessions
      .map((session) => session.score)
      .filter((score): score is number => score != null);

    const correct = answers.filter((answer) => answer.isCorrect).length;
    const totals = new Map<string, { score: number; points: number }>();

    for (const answer of answers) {
      const name = answer.examQuestion.question.theme.name;
      const current = totals.get(name) ?? { score: 0, points: 0 };
      current.score += answer.score;
      current.points += answer.examQuestion.points;
      totals.set(name, current);
    }

    const themes = [...totals.entries()]
      .map(([name, total]) => ({
        name,
        percent:
          total.points > 0 ? Math.round((total.score / total.points) * 100) : 0,
      }))
      .sort(
        (a, b) =>
          b.percent - a.percent || a.name.localeCompare(b.name, 'pt-BR'),
      );
    const scoreResult =
      scores.reduce((total, score) => total + score, 0) / scores.length || 0;

    return {
      average: scores.length ? Math.round(scoreResult * 10) / 10 : null,
      median: median(scores),
      hitRate: answers.length
        ? Math.round((correct / answers.length) * 100)
        : null,
      themes,
      classes: classes.map((schoolClass) => ({
        id: schoolClass.id,
        name: schoolClass.name,
        subjectName: schoolClass.subject.name,
      })),
      exams,
    };
  }

  async gapAnalytics(req: any, classId?: string) {
    const user = req.user;

    const classes = await this.prisma.class.findMany({
      where:
        user.role === Role.TEACHER
          ? {
              teacherAssignments: {
                some: { userId: user.id, endedAt: null },
              },
            }
          : {},
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
      },
    });

    if (classId && !classes.find((schoolClass) => schoolClass.id === classId)) {
      throw new UnauthorizedException(
        'Usuário não possui permissão para visualizar esse analytics',
      );
    }

    const classIds = classes.map((schoolClass) => schoolClass.id);
    const exams =
      classIds.length > 0
        ? await this.prisma.exam.findMany({
            where: {
              status: { in: [ExamStatus.PUBLISHED, ExamStatus.ENDED] },
              ...(user.role === Role.TEACHER ? { userId: user.id } : {}),
              assignments: {
                some: { classId: classId || { in: classIds } },
              },
              sessions: {
                some: {
                  status: SessionStatus.FINISHED,
                },
              },
            },
            select: {
              title: true,
              targetScore: true,
              examQuestions: {
                select: {
                  points: true,
                  question: {
                    select: {
                      statement: true,
                      theme: { select: { name: true } },
                    },
                  },
                  answers: {
                    where: {
                      gradeStatus: {
                        in: [GradeStatus.AUTO, GradeStatus.TEACHER_APPROVED],
                      },
                      session: {
                        status: SessionStatus.FINISHED,
                        student: {
                          studentAssignments: {
                            some: {
                              endedAt: null,
                              classId: classId || { in: classIds },
                            },
                          },
                        },
                      },
                    },
                    select: {
                      content: true,
                      isCorrect: true,
                      score: true,
                    },
                  },
                },
              },
            },
          })
        : [];

    const byTheme = new Map<
      string,
      {
        examTitle: string;
        statement: string;
        points: number;
        targetScore: number;
        correctCount: number;
        answerCount: number;
        answers: { content: string; isCorrect: boolean; score: number }[];
      }[]
    >();

    for (const exam of exams) {
      for (const examQuestion of exam.examQuestions) {
        if (examQuestion.answers.length === 0) continue;

        const wrong = examQuestion.answers.filter(
          (answer) => !answer.isCorrect,
        );
        const right = examQuestion.answers.filter((answer) => answer.isCorrect);
        const name = examQuestion.question.theme.name;
        const questions = byTheme.get(name) ?? [];
        questions.push({
          examTitle: exam.title,
          statement: examQuestion.question.statement,
          points: examQuestion.points,
          targetScore: exam.targetScore,
          correctCount: right.length,
          answerCount: examQuestion.answers.length,
          answers: [...wrong, ...right].slice(0, 8).map((answer) => ({
            content: answer.content,
            isCorrect: answer.isCorrect,
            score: answer.score,
          })),
        });
        byTheme.set(name, questions);
      }
    }

    const rankedThemes = [...byTheme.entries()]
      .map(([name, questions]) => {
        const answerCount = questions.reduce(
          (total, question) => total + question.answerCount,
          0,
        );
        const correctCount = questions.reduce(
          (total, question) => total + question.correctCount,
          0,
        );
        return {
          name,
          questions,
          percent:
            answerCount > 0
              ? Math.round((correctCount / answerCount) * 100)
              : 0,
        };
      })
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 5);

    const themes = rankedThemes.map(({ name, questions }) => ({
      name,
      questions,
    }));

    if (themes.length === 0) {
      return [];
    }

    const gaps = await this.aiService.analyseClassTheme({ themes });

    if (!gaps) {
      throw new BadRequestException(
        'Não foi possível identificar as lacunas dessa turma',
      );
    }

    const percentByTheme = new Map(
      rankedThemes.map((theme) => [
        theme.name.trim().toLocaleLowerCase('pt-BR'),
        theme.percent,
      ]),
    );

    return gaps.slice(0, 5).map((gap) => ({
      ...gap,
      percent:
        percentByTheme.get(gap.theme.trim().toLocaleLowerCase('pt-BR')) ?? 0,
    }));
  }

  async listPedagogicalReports(req: any, classId?: string) {
    const user = req.user;

    const classes = await this.prisma.class.findMany({
      where:
        user.role === Role.TEACHER
          ? {
              teacherAssignments: {
                some: { userId: user.id, endedAt: null },
              },
            }
          : {},
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
      },
    });

    if (classId && !classes.some((schoolClass) => schoolClass.id === classId)) {
      throw new UnauthorizedException(
        'Usuário não possui permissão para visualizar esse relatório',
      );
    }

    if (classes.length === 0) return [];

    const reports = await this.prisma.pedagogicalReport.findMany({
      where: {
        classId: classId || {
          in: classes.map((schoolClass) => schoolClass.id),
        },
        authorId: user.id,
      },
      include: {
        author: { select: { name: true } },
      },
    });

    const actualClass = await this.prisma.class.findFirst({
      where: { id: classId },
    });

    return reports.map((report) => ({
      id: report.id,
      title: report.title,
      className: actualClass?.name || 'Classe',
      createdAt: report.createdAt,
      authorName: report.author.name,
      analysisType: report.analysisType,
    }));
  }

  async getPedagogicalReport(req: any, id: string) {
    const user = req.user;
    const classes = await this.prisma.class.findMany({
      where:
        user.role === Role.TEACHER
          ? {
              teacherAssignments: {
                some: { userId: user.id, endedAt: null },
              },
            }
          : {},
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
      },
    });

    const report = await this.prisma.pedagogicalReport.findFirst({
      where: {
        id,
        classId: { in: classes.map((schoolClass) => schoolClass.id) },
      },
      include: {
        author: { select: { name: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Relatório não encontrado');
    }

    const actualClass = await this.prisma.class.findFirst({
      where: { id: report.classId },
      include: {
        subject: true,
      },
    });

    return {
      id: report.id,
      title: report.title,
      className: actualClass?.name,
      subjectName: actualClass?.subject.name,
      authorName: report.author.name,
      analysisType: report.analysisType,
      createdAt: report.createdAt,
      content: report.content,
    };
  }

  async createPedagogicalReport(req: any, dto: CreatePedagogicalReportDto) {
    const user = req.user;

    const classes = await this.prisma.class.findMany({
      where:
        user.role === Role.TEACHER
          ? {
              teacherAssignments: {
                some: { userId: user.id, endedAt: null },
              },
            }
          : {},
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
      },
    });

    const schoolClass = classes.find((item) => item.id === dto.classId);
    if (!schoolClass) {
      throw new UnauthorizedException(
        'Usuário não possui permissão para gerar esse relatório',
      );
    }

    const hasPerformance = dto.analysisType !== ReportAnalysisType.GAPS;
    const hasGaps = dto.analysisType !== ReportAnalysisType.PERFORMANCE;

    const content: ReportContent = {
      average: null,
      median: null,
      hitRate: null,
      themes: [],
      students: [],
      gaps: [],
    };

    if (hasPerformance) {
      const performance = await this.performanceSnapshot(user, schoolClass.id);
      content.average = performance.average;
      content.median = performance.median;
      content.hitRate = performance.hitRate;
      content.themes = performance.themes;
      content.students = performance.students;
    }

    if (hasGaps) {
      content.gaps = await this.gapSnapshot(user, schoolClass.id);
    }

    const report = await this.prisma.pedagogicalReport.create({
      data: {
        title: schoolClass.subject.name,
        classId: schoolClass.id,
        authorId: user.id,
        analysisType: dto.analysisType,
        content: content,
      },
      include: { author: { select: { name: true } } },
    });
    this.logs.audit(`Create pedagogical report ${report.id}`, user.id);
    return {
      id: report.id,
      title: report.title,
      className: schoolClass.name,
      subjectName: schoolClass.subject.name,
      authorName: report.author.name,
      analysisType: report.analysisType,
      createdAt: report.createdAt,
      content,
    };
  }

  async deletePedagogicalReport(req: any, id: string) {
    const user = req.user;
    const report = await this.prisma.pedagogicalReport.findFirst({
      where: { authorId: user.id, id },
    });
    if (!report) {
      throw new NotFoundException('Relatório não encontrado');
    } else {
      this.logs.audit(`Exclude pedagogical report ${report.id}`, user.id);
      await this.prisma.pedagogicalReport.delete({ where: { id: report.id } });
    }
    return { report: report.id, message: 'Excluido com sucesso' };
  }

  async studentAnalytics(req: any, classId: string, studentId: string) {
    const user = req.user;
    if (user.role === Role.STUDENT && user.id !== studentId) {
      throw new UnauthorizedException(
        'Usuário não possui permissão para visualizar esse analytics',
      );
    }

    const schoolClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        studentAssignments: {
          some: { userId: studentId, endedAt: null },
        },
        ...(user.role === Role.TEACHER
          ? {
              teacherAssignments: {
                some: { userId: user.id, endedAt: null },
              },
            }
          : {}),
      },
      select: {
        name: true,
        subject: { select: { name: true } },
        studentAssignments: {
          where: { userId: studentId, endedAt: null },
          select: { student: { select: { name: true, email: true } } },
        },
      },
    });

    if (!schoolClass || !schoolClass.studentAssignments[0]) {
      throw new UnauthorizedException(
        'Usuário não possui permissão para esse acesso',
      );
    }

    const inClass = {
      userId: studentId,
      exam: { assignments: { some: { classId } } },
    };
    const student = schoolClass.studentAssignments[0].student;

    const [averageResult, exams, answers] = await Promise.all([
      this.prisma.examSession.aggregate({
        where: { ...inClass, ...fullyGradedSession },
        _avg: { score: true },
      }),
      this.prisma.examSession.findMany({
        where: { ...inClass, status: SessionStatus.FINISHED },
        select: {
          score: true,
          finishedAt: true,
          exam: { select: { title: true } },
        },
      }),
      this.prisma.answer.findMany({
        where: {
          gradeStatus: {
            in: [GradeStatus.AUTO, GradeStatus.TEACHER_APPROVED],
          },
          session: { ...inClass, status: SessionStatus.FINISHED },
        },
        select: {
          score: true,
          isCorrect: true,
          examQuestion: {
            select: {
              points: true,
              question: {
                select: { type: true, theme: { select: { name: true } } },
              },
            },
          },
        },
      }),
    ]);

    const outcomes = {
      objective: { correct: 0, wrong: 0 },
      essay: { correct: 0, wrong: 0 },
    };
    const totals = new Map<string, { score: number; points: number }>();
    for (const answer of answers) {
      const kind =
        answer.examQuestion.question.type === QuestionType.OPEN_ENDED
          ? 'essay'
          : 'objective';
      outcomes[kind][answer.isCorrect ? 'correct' : 'wrong'] += 1;
      const name = answer.examQuestion.question.theme.name;
      const current = totals.get(name) ?? { score: 0, points: 0 };
      current.score += answer.score;
      current.points += answer.examQuestion.points;
      totals.set(name, current);
    }

    const themes = [...totals.entries()]
      .map(([name, total]) => ({
        name,
        percent:
          total.points > 0 ? Math.round((total.score / total.points) * 100) : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      studentName: student.name,
      className: schoolClass.name,
      subjectName: schoolClass.subject.name,
      totalAverage: roundScore(averageResult._avg.score),
      finishedExams: exams.length,
      themes,
      answers: outcomes,
      exams: exams.map((session) => ({
        title: session.exam.title,
        subjectName: schoolClass.subject.name,
        finishedAt: session.finishedAt,
        score: session.score,
      })),
    };
  }

  async studentThemeAnalysis(req: any, classId: string, studentId: string) {
    const report = await this.studentAnalytics(req, classId, studentId);

    if (report.themes.length === 0) {
      throw new BadRequestException(
        'Não há resultado por tema para analisar esse aluno',
      );
    }

    const analysis = await this.aiService.analyzeStudentThemes({
      subjectName: report.subjectName,
      themes: report.themes,
      exams: report.exams,
    });

    if (!analysis) {
      throw new BadRequestException(
        'Não foi possível analisar o desempenho desse aluno',
      );
    }

    return analysis;
  }

  private async performanceSnapshot(
    user: { id: string; role: Role },
    classId: string,
  ) {
    const exams = await this.prisma.exam.findMany({
      where: {
        status: { in: [ExamStatus.PUBLISHED, ExamStatus.ENDED] },
        ...(user.role === Role.TEACHER ? { userId: user.id } : {}),
        assignments: { some: { classId } },
      },
      select: { id: true },
    });
    const examIds = exams.map((exam) => exam.id);
    const sessions =
      examIds.length === 0
        ? []
        : await this.prisma.examSession.findMany({
            where: {
              ...fullyGradedSession,
              examId: { in: examIds },
              student: {
                studentAssignments: {
                  some: { classId, endedAt: null },
                },
              },
            },
            select: {
              id: true,
              score: true,
              student: { select: { id: true, name: true } },
              exam: { select: { title: true } },
            },
          });
    const answers =
      sessions.length === 0
        ? []
        : await this.prisma.answer.findMany({
            where: { sessionId: { in: sessions.map((session) => session.id) } },
            select: {
              isCorrect: true,
              score: true,
              examQuestion: {
                select: {
                  points: true,
                  question: { select: { theme: { select: { name: true } } } },
                },
              },
            },
          });

    const studentsById = new Map<
      string,
      { name: string; exams: { title: string; score: number | null }[] }
    >();
    for (const session of sessions) {
      const current = studentsById.get(session.student.id) ?? {
        name: session.student.name,
        exams: [],
      };
      current.exams.push({
        title: session.exam.title,
        score: session.score,
      });
      studentsById.set(session.student.id, current);
    }

    const scores = sessions
      .map((session) => session.score)
      .filter((score): score is number => score != null);
    const correct = answers.filter((answer) => answer.isCorrect).length;
    const totals = new Map<string, { score: number; points: number }>();

    for (const answer of answers) {
      const name = answer.examQuestion.question.theme.name;
      const current = totals.get(name) ?? { score: 0, points: 0 };
      current.score += answer.score;
      current.points += answer.examQuestion.points;
      totals.set(name, current);
    }

    return {
      average: scores.length
        ? Math.round(
            (scores.reduce((total, score) => total + score, 0) /
              scores.length) *
              10,
          ) / 10
        : null,
      median: median(scores),
      hitRate: answers.length
        ? Math.round((correct / answers.length) * 100)
        : null,
      themes: [...totals.entries()]
        .map(([name, total]) => ({
          name,
          percent:
            total.points > 0
              ? Math.round((total.score / total.points) * 100)
              : 0,
        }))
        .sort(
          (a, b) =>
            b.percent - a.percent || a.name.localeCompare(b.name, 'pt-BR'),
        ),
      students: [...studentsById.values()]
        .map((student) => ({
          ...student,
          exams: student.exams.sort((a, b) =>
            a.title.localeCompare(b.title, 'pt-BR'),
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    };
  }

  private async gapSnapshot(user: { id: string; role: Role }, classId: string) {
    const exams = await this.prisma.exam.findMany({
      where: {
        status: { in: [ExamStatus.PUBLISHED, ExamStatus.ENDED] },
        ...(user.role === Role.TEACHER ? { userId: user.id } : {}),
        assignments: { some: { classId } },
      },
      select: {
        title: true,
        targetScore: true,
        examQuestions: {
          select: {
            points: true,
            question: {
              select: {
                statement: true,
                theme: { select: { name: true } },
              },
            },
            answers: {
              where: {
                gradeStatus: {
                  in: [GradeStatus.AUTO, GradeStatus.TEACHER_APPROVED],
                },
                session: {
                  status: SessionStatus.FINISHED,
                  student: {
                    studentAssignments: {
                      some: { endedAt: null, classId },
                    },
                  },
                },
              },
              select: { content: true, isCorrect: true, score: true },
            },
          },
        },
      },
    });

    const byTheme = new Map<
      string,
      {
        examTitle: string;
        statement: string;
        points: number;
        targetScore: number;
        correctCount: number;
        answerCount: number;
        answers: { content: string; isCorrect: boolean; score: number }[];
      }[]
    >();

    for (const exam of exams) {
      for (const examQuestion of exam.examQuestions) {
        if (examQuestion.answers.length === 0) continue;
        const wrong = examQuestion.answers.filter(
          (answer) => !answer.isCorrect,
        );
        const right = examQuestion.answers.filter((answer) => answer.isCorrect);
        const name = examQuestion.question.theme.name;
        const questions = byTheme.get(name) ?? [];
        questions.push({
          examTitle: exam.title,
          statement: examQuestion.question.statement,
          points: examQuestion.points,
          targetScore: exam.targetScore,
          correctCount: right.length,
          answerCount: examQuestion.answers.length,
          answers: [...wrong, ...right].slice(0, 8).map((answer) => ({
            content: answer.content,
            isCorrect: answer.isCorrect,
            score: answer.score,
          })),
        });
        byTheme.set(name, questions);
      }
    }

    const rankedThemes = [...byTheme.entries()]
      .map(([name, questions]) => {
        const answerCount = questions.reduce(
          (total, question) => total + question.answerCount,
          0,
        );
        const correctCount = questions.reduce(
          (total, question) => total + question.correctCount,
          0,
        );
        return {
          name,
          questions,
          percent:
            answerCount > 0
              ? Math.round((correctCount / answerCount) * 100)
              : 0,
        };
      })
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 5);

    if (rankedThemes.length === 0) return [];

    const gaps = await this.aiService.analyseClassTheme({
      themes: rankedThemes.map(({ name, questions }) => ({ name, questions })),
    });

    if (!gaps) {
      throw new BadRequestException(
        'Não foi possível identificar as lacunas dessa turma',
      );
    }

    const percentByTheme = new Map(
      rankedThemes.map((theme) => [
        theme.name.trim().toLocaleLowerCase('pt-BR'),
        theme.percent,
      ]),
    );

    return gaps.slice(0, 5).map((gap) => ({
      ...gap,
      percent:
        percentByTheme.get(gap.theme.trim().toLocaleLowerCase('pt-BR')) ?? 0,
    }));
  }

  private async adminDashboard(sessions: Prisma.ExamSessionWhereInput) {
    const [
      totalUsers,
      totalTeachers,
      totalStudents,
      totalClasses,
      totalExams,
      completedExams,
      averageResult,
    ] = await Promise.all([
      this.prisma.user.count({ where: { anonymizedAt: null } }),
      this.prisma.user.count({
        where: { role: Role.TEACHER, anonymizedAt: null },
      }),
      this.prisma.user.count({
        where: { role: Role.STUDENT, anonymizedAt: null },
      }),
      this.prisma.class.count(),
      this.prisma.exam.count(),
      this.prisma.examSession.count({ where: sessions }),
      this.prisma.examSession.aggregate({
        where: { ...sessions, answers: fullyGradedSession.answers },
        _avg: { score: true },
      }),
    ]);

    return {
      role: Role.ADMIN,
      totalUsers,
      totalTeachers,
      totalStudents,
      totalClasses,
      totalExams,
      completedExams,
      totalAverage: roundScore(averageResult._avg.score),
    };
  }

  private async teacherDashboard(
    userId: string,
    period: DashboardPeriodRange,
    sessions: Prisma.ExamSessionWhereInput,
    classId?: string,
  ) {
    const [totalExams, averageResult] = await Promise.all([
      this.prisma.exam.count({
        where: {
          userId,
          ...(period.from && period.to
            ? { startsAt: { gte: period.from, lt: period.to } }
            : {}),
          ...(classId ? { assignments: { some: { classId } } } : {}),
        },
      }),
      this.prisma.examSession.aggregate({
        where: { ...sessions, answers: fullyGradedSession.answers },
        _avg: { score: true },
      }),
    ]);

    return {
      role: Role.TEACHER,
      totalExams,
      totalAverage: roundScore(averageResult._avg.score),
    };
  }

  private async studentDashboard(
    userId: string,
    sessions: Prisma.ExamSessionWhereInput,
    classId?: string,
    subjectId?: string,
  ) {
    const [finishedExams, upcomingExams, averageResult] = await Promise.all([
      this.prisma.examSession.count({ where: sessions }),
      this.prisma.exam.count({
        where: {
          status: ExamStatus.PUBLISHED,
          assignments: {
            some: {
              ...(classId ? { classId } : {}),
              class: {
                ...(subjectId ? { subjectId } : {}),
                studentAssignments: { some: { userId, endedAt: null } },
              },
            },
          },
          sessions: { none: { userId, status: SessionStatus.FINISHED } },
        },
      }),
      this.prisma.examSession.aggregate({
        where: { ...sessions, answers: fullyGradedSession.answers },
        _avg: { score: true },
      }),
    ]);

    return {
      role: Role.STUDENT,
      upcomingExams,
      finishedExams,
      totalAverage: roundScore(averageResult._avg.score),
    };
  }

  private async dashboardCharts(
    sessions: Prisma.ExamSessionWhereInput,
    byDay: boolean,
  ) {
    const rows = await this.prisma.examSession.findMany({
      where: sessions,
      orderBy: { finishedAt: 'asc' },
      select: {
        score: true,
        finishedAt: true,
        exam: { select: { id: true, title: true } },
        answers: {
          select: {
            isCorrect: true,
            gradeStatus: true,
            examQuestion: {
              select: {
                id: true,
                order: true,
                question: { select: { theme: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    const answers: Outcomes = { correct: 0, wrong: 0, pending: 0 };
    const exams = new Map<string, ExamStats>();
    const timeline = new Map<string, number>();
    let pendingSubmissions = 0;

    for (const row of rows) {
      const exam: ExamStats = exams.get(row.exam.id) ?? {
        examId: row.exam.id,
        title: row.exam.title,
        hasPending: false,
        scores: [],
        questions: new Map(),
      };
      exams.set(row.exam.id, exam);

      let sessionPending = false;
      for (const answer of row.answers) {
        const outcome =
          answer.gradeStatus === GradeStatus.PENDING
            ? 'pending'
            : answer.isCorrect
              ? 'correct'
              : 'wrong';
        const { id, order, question } = answer.examQuestion;
        const stats = exam.questions.get(id) ?? {
          order,
          theme: question.theme.name,
          correct: 0,
          wrong: 0,
          pending: 0,
        };
        stats[outcome] += 1;
        answers[outcome] += 1;
        exam.questions.set(id, stats);
        if (outcome === 'pending') sessionPending = true;
      }

      if (sessionPending) {
        exam.hasPending = true;
        pendingSubmissions += 1;
      }
      if (row.score !== null) exam.scores.push(row.score);

      if (row.finishedAt) {
        const label = row.finishedAt.toLocaleDateString('pt-BR', {
          ...(byDay
            ? { day: '2-digit', month: '2-digit' }
            : { month: '2-digit', year: 'numeric' }),
          timeZone: TIME_ZONE,
        });
        timeline.set(label, (timeline.get(label) ?? 0) + 1);
      }
    }

    const recentExams = [...exams.values()].slice(-MAX_EXAMS_IN_CHART);
    const graded = answers.correct + answers.wrong;

    return {
      hitRate: graded ? Math.round((answers.correct / graded) * 100) : null,
      pendingSubmissions,
      answers,
      scoresByExam: recentExams
        .filter((exam) => !exam.hasPending && exam.scores.length > 0)
        .map((exam) => ({
          examId: exam.examId,
          title: exam.title,
          average:
            Math.round(
              (exam.scores.reduce((sum, score) => sum + score, 0) /
                exam.scores.length) *
                100,
            ) / 100,
        })),
      questionsByExam: recentExams.map((exam) => {
        const questions = [...exam.questions.values()]
          .sort((a, b) => a.order - b.order)
          .map(({ theme, correct, wrong, pending }, index) => ({
            number: index + 1,
            theme,
            correct,
            wrong,
            pending,
          }));
        return {
          examId: exam.examId,
          title: exam.title,
          answers: {
            correct: questions.reduce((sum, q) => sum + q.correct, 0),
            wrong: questions.reduce((sum, q) => sum + q.wrong, 0),
            pending: questions.reduce((sum, q) => sum + q.pending, 0),
          },
          questions,
        };
      }),
      timeline: [...timeline].map(([label, submissions]) => ({
        label,
        submissions,
      })),
    };
  }
}