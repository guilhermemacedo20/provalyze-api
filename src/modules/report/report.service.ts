import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ExamStatus, GradeStatus, Role, SessionStatus } from '@prisma/client';
import { AIService } from 'src/infra/ai/ai.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';

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

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
  ) {}

  async dashInformation(req: any) {
    const user = req.user;

    if (user.role === Role.ADMIN || user.role === Role.COORDINATOR) {
      return this.adminDashboard();
    }

    if (user.role === Role.TEACHER) {
      return this.teacherDashboard(user.id);
    }

    if (user.role === Role.STUDENT) {
      return this.studentDashboard(user.id);
    }

    throw new NotFoundException('Dashboard information not found');
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
          examQuestion: {
            select: {
              points: true,
              question: { select: { theme: { select: { name: true } } } },
            },
          },
        },
      }),
    ]);

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
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      studentName: student.name,
      className: schoolClass.name,
      subjectName: schoolClass.subject.name,
      totalAverage: roundScore(averageResult._avg.score),
      finishedExams: exams.length,
      themes,
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

  private async adminDashboard() {
    const [
      totalUsers,
      totalTeachers,
      totalStudents,
      totalClasses,
      totalExams,
      completedExams,
      averageResult,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.TEACHER } }),
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
      this.prisma.class.count(),
      this.prisma.exam.count(),
      this.prisma.examSession.count({
        where: { status: SessionStatus.FINISHED },
      }),
      this.prisma.examSession.aggregate({
        where: fullyGradedSession,
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

  private async teacherDashboard(userId: string) {
    const [totalExams, averageResult, grouped] = await Promise.all([
      this.prisma.exam.count({ where: { userId } }),
      this.prisma.examSession.aggregate({
        where: {
          ...fullyGradedSession,
          exam: { userId },
        },
        _avg: { score: true },
      }),
      this.prisma.answer.groupBy({
        by: ['isCorrect'],
        where: {
          gradeStatus: { in: [GradeStatus.AUTO, GradeStatus.TEACHER_APPROVED] },
          examQuestion: { exam: { userId } },
        },
        _count: { _all: true },
      }),
    ]);

    const corrected = grouped.reduce(
      (total, row) => total + row._count._all,
      0,
    );
    const correct = grouped.find((row) => row.isCorrect)?._count._all ?? 0;

    return {
      role: Role.TEACHER,
      totalExams,
      totalAverage: roundScore(averageResult._avg.score),
      hitRate: corrected ? Math.round((correct / corrected) * 100) : null,
    };
  }

  private async studentDashboard(userId: string) {
    const [finishedExams, upcomingExams, averageResult] = await Promise.all([
      this.prisma.examSession.count({
        where: { userId, status: SessionStatus.FINISHED },
      }),
      this.prisma.exam.count({
        where: {
          status: ExamStatus.PUBLISHED,
          assignments: {
            some: {
              class: {
                studentAssignments: { some: { userId, endedAt: null } },
              },
            },
          },
          sessions: { none: { userId, status: SessionStatus.FINISHED } },
        },
      }),
      this.prisma.examSession.aggregate({
        where: { userId, ...fullyGradedSession },
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
}
